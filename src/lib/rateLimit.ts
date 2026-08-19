import { NextRequest, NextResponse } from "next/server";

/* ---------------------------------------------------------------------------
   Two stores, one interface.

   The counters used to live only in this process's memory, which is correct for
   one Node instance and wrong for any number greater than one — and it failed
   silently: with three instances behind a load balancer a "10 per 15 minutes"
   rule quietly becomes thirty. On serverless it is worse still, because each
   invocation may get a fresh isolate, so the counters reset constantly and the
   limiter does approximately nothing while continuing to look correct.

   So: if UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set, the
   counters live in Redis and every instance shares them. If they are not, the
   in-memory Map below is used and a warning is logged once in production.

   WHY UPSTASH'S REST API AND NOT A REDIS CLIENT

   No new dependency, and nothing to keep alive. It is plain HTTP, so it works
   from a serverless isolate that cannot hold a TCP connection open between
   invocations — which is the deployment target this whole change exists for.
   Swapping in @upstash/redis or ioredis later means rewriting `redisHit` and
   nothing else.

   WHY hit() AND peek() ARE NOW ASYNC

   They cross a network. There is no honest way to keep a synchronous signature
   over a remote store, and pretending otherwise would mean either blocking the
   event loop or reading a stale local copy. Every caller already sits inside an
   async handler, so this costs one `await` each.
--------------------------------------------------------------------------- */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/* Without eviction this Map grows one entry per unique key forever, and an
   attacker cycling source addresses turns a rate limiter into a memory leak.
   Swept lazily on write rather than on a timer: no interval to leak in dev
   through hot reload, and the work stays proportional to traffic. */
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

function sweep(now: number) {
    if (now - lastSweep < SWEEP_INTERVAL_MS) return;
    lastSweep = now;
    for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
    }
}

export type LimitRule = { limit: number; windowMs: number };

export type LimitVerdict =
    | { allowed: true }
    | { allowed: false; retryAfterSeconds: number };

/* A fixed window per key. Sliding would avoid the boundary burst of 2N requests
   either side of a window edge, which matters for a public API being paced by a
   well-behaved client. It matters much less here: every caller is an endpoint
   whose limit is far below what a human produces, so an attacker doubling their
   budget at one instant still gets nowhere near a password. */
function memoryHit(key: string, rule: LimitRule, now: number): LimitVerdict {
    sweep(now);

    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
        return { allowed: true };
    }

    if (bucket.count >= rule.limit) {
        return {
            allowed: false,
            retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
        };
    }

    bucket.count += 1;
    return { allowed: true };
}

function memoryPeek(key: string, rule: LimitRule, now: number): LimitVerdict {
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) return { allowed: true };
    if (bucket.count < rule.limit) return { allowed: true };
    return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
}

/* --- Redis (Upstash REST) ------------------------------------------------- */

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const usingRedis = Boolean(REDIS_URL && REDIS_TOKEN);

/* Logged once at module load rather than per request, so a misconfigured
   production deploy is visible in the boot log instead of drowning the request
   log. Silence in development is deliberate: the Map is the right store there. */
if (!usingRedis && process.env.NODE_ENV === "production") {
    console.warn(
        "[rateLimit] UPSTASH_REDIS_REST_URL/TOKEN are not set — rate limits are " +
        "per-instance only. With more than one instance every limit is multiplied " +
        "by the instance count, and on serverless they reset with each cold start."
    );
}

/* Namespaced so these keys cannot collide with anything else in the database. */
const rkey = (key: string) => `rl:${key}`;

type PipelineResult = { result: number | null }[];

async function redisPipeline(commands: (string | number)[][]): Promise<PipelineResult> {
    const res = await fetch(`${REDIS_URL}/pipeline`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${REDIS_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(commands),
        /* A limiter must never be the slowest thing in a request. If Redis is
           having a bad day, give up quickly and fall back rather than making
           every login wait on it. */
        signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}: ${await res.text()}`);
    return res.json();
}

/* INCR, then set the expiry only if the key does not already have one, then read
   the TTL back — as one pipeline, so it is one round trip rather than three.

   EXPIRE ... NX rather than "if count === 1 then EXPIRE". The naive version has
   a real race: two instances can both see INCR return 1 (the second because the
   first crashed between INCR and EXPIRE), and the later EXPIRE would extend the
   window. NX makes the expiry write-once, so the window is anchored to whoever
   created the key.

   Without NX there is also the classic leak: an INCR that never gets its EXPIRE
   leaves a key with no TTL, which then blocks that identity forever. */
async function redisHit(key: string, rule: LimitRule): Promise<LimitVerdict> {
    const seconds = Math.ceil(rule.windowMs / 1000);
    const k = rkey(key);

    const [incr, , ttl] = await redisPipeline([
        ["INCR", k],
        ["EXPIRE", k, seconds, "NX"],
        ["TTL", k],
    ]);

    const count = incr.result ?? 1;
    /* TTL answers -1 for a key with no expiry and -2 for one that does not
       exist. Neither should happen after the EXPIRE above, but if it does the
       honest answer is the full window rather than a negative Retry-After. */
    const remaining = ttl.result != null && ttl.result > 0 ? ttl.result : seconds;

    /* `>` not `>=`: INCR already counted this request, so `count` includes it.
       The memory path increments after its comparison, which is why the two read
       differently while meaning the same thing. */
    return count > rule.limit
        ? { allowed: false, retryAfterSeconds: Math.max(1, remaining) }
        : { allowed: true };
}

async function redisPeek(key: string, rule: LimitRule): Promise<LimitVerdict> {
    const k = rkey(key);
    const [get, ttl] = await redisPipeline([["GET", k], ["TTL", k]]);

    const count = Number(get.result ?? 0);
    if (count < rule.limit) return { allowed: true };

    const seconds = Math.ceil(rule.windowMs / 1000);
    const remaining = ttl.result != null && ttl.result > 0 ? ttl.result : seconds;
    return { allowed: false, retryAfterSeconds: Math.max(1, remaining) };
}

/* --- Public surface -------------------------------------------------------- */

/* FALLBACK ON ERROR, NOT FAIL-OPEN AND NOT FAIL-CLOSED.

   Both of the usual answers are bad here. Failing open during a Redis outage
   removes the only brute-force defence on the login endpoint at exactly the
   moment nobody is watching. Failing closed locks every user out of the product
   because a cache is down, which turns a degraded dependency into a full outage.

   Falling back to the in-memory Map is strictly better than either: the limit
   still applies per instance, so an attacker gets the instance count as a
   multiplier rather than infinity, and no legitimate user is ever refused. */
async function withFallback(
    remote: () => Promise<LimitVerdict>,
    local: () => LimitVerdict
): Promise<LimitVerdict> {
    if (!usingRedis) return local();
    try {
        return await remote();
    } catch (error: any) {
        console.error("[rateLimit] Redis unavailable, falling back to memory:", error?.message ?? error);
        return local();
    }
}

export async function hit(key: string, rule: LimitRule, now = Date.now()): Promise<LimitVerdict> {
    return withFallback(() => redisHit(key, rule), () => memoryHit(key, rule, now));
}

/* Consumed only on failure — see the login route. A successful sign-in must not
   spend anyone's budget, or a user with a busy day locks themselves out. */
export async function peek(key: string, rule: LimitRule, now = Date.now()): Promise<LimitVerdict> {
    return withFallback(() => redisPeek(key, rule), () => memoryPeek(key, rule, now));
}

/* NextRequest.ip and .geo were removed in Next 15, so the forwarded header is
   the only source left. It is client-controllable unless something upstream
   overwrites it: trustworthy behind a proxy that was configured for it,
   worthless on a bare server exposed directly. Treated as a best-effort key and
   never as identity, since nothing here decides who someone is.

   Falls back to a single shared bucket rather than to "unlimited", so a request
   with no forwarded header cannot opt out of the limit by omission. */
export function clientKey(request: NextRequest): string {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim();
    return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/* No X-RateLimit-Remaining, deliberately. On a public API those headers are good
   manners, letting an honest client pace itself. On an auth endpoint they are a
   live readout of how hard an attacker may push. */
export function tooManyRequests(retryAfterSeconds: number, message: string) {
    return NextResponse.json(
        { error: message, code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
}

/* Tunings. Every one of these sits well above what a human produces and far
   below what makes guessing viable — the gap between those two numbers is the
   entire reason rate limiting works on auth endpoints. */
export const LIMITS = {
    /* Tight, and does the heavy lifting: stops one machine working through many
       accounts. */
    loginByIp: { limit: 10, windowMs: 15 * 60_000 },

    /* Looser and longer, because this key is a weapon pointed at our own users:
       anyone can burn a stranger's budget by failing their login on purpose. 20
       guesses an hour is useless against any real password, while the collateral
       lockout stays small and heals by itself. Throttled, never flagged on the
       user document — a state flag would need a human to clear it, turning a
       nuisance into a support ticket. */
    loginByAccount: { limit: 20, windowMs: 60 * 60_000 },

    /* Each one costs a bcrypt hash and a permanent row in the users collection,
       so the cost of abuse outlives the request. */
    signup: { limit: 5, windowMs: 60 * 60_000 },

    /* Keyed by user id rather than IP: this endpoint is authenticated, and the
       thing being rationed is outbound email charged to our SMTP reputation.
       Three an hour covers "it went to spam, try again" twice over; anything
       more is a script. */
    resendVerification: { limit: 3, windowMs: 60 * 60_000 },

    /* The token is 256 bits, so guessing it is not the threat. The limit is here
       so an unauthenticated endpoint cannot be used to hammer the users
       collection with lookups. Loose enough that a real person clicking a link
       twice, or a mail scanner pre-fetching it, never notices. */
    verifyEmail: { limit: 20, windowMs: 15 * 60_000 },

    /* Unauthenticated, and every call is a regex scan plus a $near geo query.
       SearchModal debounces at 300ms, so a fast typer genuinely produces around
       three a second, and a limit that punishes that punishes real users. */
    search: { limit: 30, windowMs: 60_000 },

    /* Also unauthenticated, and a $near query over 20km. Looser than `search`
       per minute because the map re-queries as a user pans, and nobody pans
       sixty times a minute by accident. */
    nearby: { limit: 60, windowMs: 60_000 },

    /* THE EXPENSIVE ONE, and the only limit here that guards a third party's
       bill rather than our own CPU.

       Keyed on a ~1km grid cell rather than on the caller — see geoCell in
       lib/coords.ts. The thing being rationed is "sync this area from
       Foursquare", which is a property of the PLACE, not the person: ten
       neighbours opening the app in a genuinely new area should cost one sync
       between them, not ten. Keying on IP would give each of them their own
       budget and multiply the bill by the crowd.

       One per cell per hour. A cold area is populated on the first request and
       served from Mongo for everyone after, and the rows do not go stale in an
       hour — lastFetchedAt exists for the slower refresh cycle. */
    foursquareSync: { limit: 1, windowMs: 60 * 60_000 },
} as const;
