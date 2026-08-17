import { NextRequest, NextResponse } from "next/server";

/* ---------------------------------------------------------------------------
   STORE ASSUMPTION — READ THIS BEFORE DEPLOYING.

   Counters live in this process's memory. That is correct for ONE Node
   instance and wrong for any number greater than one, and it fails SILENTLY:
   with three instances behind a load balancer a "10 per 15 minutes" rule
   becomes thirty, with nothing in the logs to say so.

   Worse on serverless (Vercel-style), where each invocation may get a fresh
   isolate — the counters reset constantly and this file does approximately
   nothing while continuing to look correct in review.

   There is no deployment config in this repo yet, so this is the honest first
   step rather than a mistake. The moment a second instance exists, the Map
   below has to become Redis/Upstash. Nothing else in this file changes.
--------------------------------------------------------------------------- */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/* Without eviction this Map grows one entry per unique key forever, and an
   attacker cycling source addresses turns a rate limiter into a memory leak.
   Swept lazily on write rather than on a timer: no interval to leak in dev
   through hot reload, and the work is proportional to traffic. */
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

/* A fixed window per key. Sliding would avoid the boundary burst — 2N requests
   either side of a window edge — which matters for a public API being paced by
   a well-behaved client. It matters much less here: every caller of this is an
   endpoint where the limit is far below what a human produces, so an attacker
   doubling their budget at one instant still gets nowhere near a password. */
export function hit(key: string, rule: LimitRule, now = Date.now()): LimitVerdict {
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

/* Consumed only on failure — see the login route. A successful sign-in must not
   spend anyone's budget, or a user with a busy day locks themselves out. */
export function peek(key: string, rule: LimitRule, now = Date.now()): LimitVerdict {
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) return { allowed: true };
    if (bucket.count < rule.limit) return { allowed: true };
    return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
}

/* NextRequest.ip and .geo were REMOVED in Next 15, so the forwarded header is
   the only source left. It is client-controllable unless something upstream
   overwrites it — trustworthy behind a proxy you configured, worthless on a
   bare server exposed directly. Treated as a best-effort key, never as
   identity: nothing here decides who someone IS.

   Falls back to a single shared bucket rather than to "unlimited", so a request
   with no forwarded header cannot opt out of the limit by omission. */
export function clientKey(request: NextRequest): string {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim();
    return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/* Deliberately no X-RateLimit-Remaining. On a public API those headers are good
   manners — they let an honest client pace itself. On an auth endpoint they are
   a live readout of how hard an attacker may push. */
export function tooManyRequests(retryAfterSeconds: number, message: string) {
    return NextResponse.json(
        { error: message, code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
}

/* Tunings. Every one of these is well above what a human produces and far below
   what makes guessing viable — the gap between those two numbers is the entire
   reason rate limiting works on auth endpoints. */
export const LIMITS = {
    /* Tight, and does the heavy lifting: stops one machine working through many
       accounts. */
    loginByIp: { limit: 10, windowMs: 15 * 60_000 },

    /* Looser and longer, because this key is a weapon pointed at your own
       users: anyone can burn a stranger's budget by failing their login on
       purpose. 20 guesses an hour is useless against any real password, while
       the collateral lockout stays small and heals by itself. Throttled, never
       flagged on the user document — a state flag would need a human to clear
       it, turning a nuisance into a support ticket. */
    loginByAccount: { limit: 20, windowMs: 60 * 60_000 },

    /* Each one costs a bcrypt hash AND a permanent row in the users
       collection, so the cost of abuse outlives the request. */
    signup: { limit: 5, windowMs: 60 * 60_000 },

    /* The token is 256 bits, so guessing it is not the threat — the limit is
       here so an unauthenticated endpoint cannot be used to hammer the users
       collection with lookups. Loose enough that a real person clicking a link
       twice, or a mail scanner pre-fetching it, never notices. */
    verifyEmail: { limit: 20, windowMs: 15 * 60_000 },

    /* Unauthenticated, and every call is a regex scan plus a $near geo query.
       SearchModal debounces at 300ms, so a fast typer genuinely produces ~3/sec
       — a limit that punishes that punishes real users. */
    search: { limit: 30, windowMs: 60_000 },
} as const;
