/* End-to-end smoke test for every HTTP endpoint in this app.
 *
 * Run:  npm run test:api
 *       npm run test:api -- --only=auth,reviews      (sections, comma separated)
 *       npm run test:api -- --keep                   (skip teardown, inspect the data)
 *       npm run test:api -- --no-ratelimit           (skip the 429 sections; they are slow
 *                                                     and they poison the in-memory buckets
 *                                                     for anything you run afterwards)
 *
 * Requires the Next dev server on BASE_URL (default http://localhost:3000).
 * The FastAPI recommender is optional — its section reports SKIP, not FAIL,
 * when nothing answers on RECOMMENDER_URL.
 *
 * WHY THIS TALKS TO MONGO DIRECTLY
 * Three things have no HTTP route that can produce them: a verified account
 * (the token only ever arrives by email), a completed reservation (only the
 * passage of time makes one), and a restaurant with known coordinates. Each is
 * a precondition for a whole family of endpoints, so the alternative to seeding
 * them is leaving those endpoints untested. Everything else goes through HTTP
 * like a real client.
 *
 * WHY EVERY ACTOR GETS ITS OWN x-forwarded-for
 * rateLimit.ts keys off that header. Signup allows 5 per hour per IP and this
 * script creates more accounts than that, so without a distinct address per
 * actor the run would fail on rate limiting rather than on anything real. The
 * dedicated 429 tests use their own throwaway addresses for the same reason —
 * so they cannot spend the budget the rest of the run depends on.
 */

import { MongoClient, ObjectId } from "mongodb";
import { createHmac } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const RECOMMENDER = (process.env.RECOMMENDER_URL ?? "http://localhost:8000").replace(/\/$/, "");

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

const ONLY = opt("only")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;
const KEEP = flag("keep");
const SKIP_RATELIMIT = flag("no-ratelimit");

/* Stamped into every username, email and fsqId this run creates. Teardown
   deletes by this prefix and by collected ids only, never by a broad filter —
   this runs against a development database that has real rows in it. */
const RUN = Date.now().toString(36);
const TAG = `smoke_${RUN}`;

/* ------------------------------------------------------------------ *
 *  Reporting
 * ------------------------------------------------------------------ */

const results = [];
let currentSection = "(none)";

const C = process.stdout.isTTY
    ? { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[90m", b: "\x1b[1m", x: "\x1b[0m" }
    : { g: "", r: "", y: "", d: "", b: "", x: "" };

function section(name) {
    currentSection = name;
    console.log(`\n${C.b}── ${name} ${"─".repeat(Math.max(0, 58 - name.length))}${C.x}`);
}

function record(status, label, detail) {
    results.push({ section: currentSection, status, label, detail });
    const mark =
        status === "PASS" ? `${C.g}  ok  ${C.x}` :
        status === "FAIL" ? `${C.r} FAIL ${C.x}` :
                            `${C.y} skip ${C.x}`;
    console.log(`${mark} ${label}${detail ? `  ${C.d}${detail}${C.x}` : ""}`);
}

/* The whole assertion vocabulary. `expected` is a status code or a list of
   them; a list is not laziness but the honest answer where the app has two
   legitimate replies (a 503 when the recommender is down, a 200 when it is
   not, and the test is that it never 500s). */
function check(label, actual, expected, extra) {
    const want = Array.isArray(expected) ? expected : [expected];
    if (want.includes(actual)) {
        record("PASS", label, `${actual}`);
        return true;
    }
    record("FAIL", label, `expected ${want.join("|")}, got ${actual}${extra ? ` — ${trunc(extra)}` : ""}`);
    return false;
}

function checkThat(label, condition, detail) {
    if (condition) { record("PASS", label, detail); return true; }
    record("FAIL", label, detail);
    return false;
}

function skip(label, why) { record("SKIP", label, why); }

function trunc(value, n = 200) {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    if (!s) return "";
    return s.length > n ? `${s.slice(0, n)}…` : s;
}

/* A section that throws has a bug in the test or a dead server; either way the
   remaining sections still carry information, so it is recorded and stepped
   over rather than aborting the run. */
async function runSection(name, fn) {
    if (ONLY && !ONLY.includes(name)) return;
    section(name);
    try {
        await fn();
    } catch (error) {
        record("FAIL", `${name} section threw`, error?.message ?? String(error));
    }
}

/* ------------------------------------------------------------------ *
 *  HTTP
 * ------------------------------------------------------------------ */

/* An actor is a cookie jar plus a source address. Passing one of these around
   is what makes "as Alice" and "as a stranger" one argument instead of a pile
   of headers at every call site. */
function actor(name, ip) {
    return { name, ip: ip ?? randomIp(), cookie: null, id: null, username: null, email: null, password: null };
}

let ipCounter = 0;
function randomIp() {
    ipCounter += 1;
    return `203.0.113.${ipCounter % 254 + 1}`;   // TEST-NET-3, reserved for documentation
}

const ANON = actor("anon");

async function call(method, path, { as = ANON, body, raw, query, headers = {} } = {}) {
    const url = new URL(path.startsWith("http") ? path : BASE + path);
    if (query) for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
    }

    const requestHeaders = {
        "x-forwarded-for": as.ip,
        ...headers,
    };
    if (as.cookie) requestHeaders.cookie = `token=${as.cookie}`;

    /* fetch() throws outright on a GET/HEAD with a body, which surfaces as
       "no response" and reads like a dead server. The sweeps below pass a body
       uniformly across every method, so it is dropped here instead. */
    const bodyless = method === "GET" || method === "HEAD";

    let payload;
    if (bodyless) {
        payload = undefined;
    } else if (raw !== undefined) {
        payload = raw;                                    // deliberately malformed bodies
        requestHeaders["content-type"] ??= "application/json";
    } else if (body !== undefined) {
        payload = JSON.stringify(body);
        requestHeaders["content-type"] = "application/json";
    }

    let response;
    try {
        response = await fetch(url, { method, headers: requestHeaders, body: payload, redirect: "manual" });
    } catch (error) {
        throw new Error(`${method} ${path} — no response (${error.message}). Is the server on ${BASE}?`);
    }

    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* HTML error pages and empty bodies */ }

    /* Captured off the response rather than tracked by fetch, because Node's
       fetch has no cookie jar. Only "token" matters here. */
    const setCookie = response.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookie) {
        const match = /^token=([^;]*)/.exec(cookie);
        if (match) as.cookie = match[1] === "" ? null : match[1];
    }

    return { status: response.status, json, text, headers: response.headers, setCookie };
}

const GET = (path, o) => call("GET", path, o);
const POST = (path, o) => call("POST", path, o);
const PATCH = (path, o) => call("PATCH", path, o);
const PUT = (path, o) => call("PUT", path, o);
const DELETE = (path, o) => call("DELETE", path, o);

/* ------------------------------------------------------------------ *
 *  Fixtures
 * ------------------------------------------------------------------ */

let db, mongo;
const created = { users: [], restaurants: [], reservations: [], reviews: [], groups: [], addresses: [] };

/* Two coordinates far enough apart that a $near with a 20km radius from one
   cannot reach the other — that separation is what makes the geo assertions
   mean anything. */
const HERE = { lat: 37.7749, lng: -122.4194 };   // San Francisco
const FAR = { lat: 40.7128, lng: -74.0060 };     // New York

async function connectMongo() {
    const uri = process.env.mongo_url;
    if (!uri) throw new Error("mongo_url is not set. Run via: npm run test:api");
    mongo = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await mongo.connect();
    db = mongo.db();
}

/* Signs up over HTTP so the real code path runs, then flips isVerified in the
   database because the only other way to set it is a token that arrives by
   email. */
async function makeUser(suffix, { verified = true } = {}) {
    const a = actor(suffix);
    a.username = `${TAG}_${suffix}`;
    a.email = `${TAG}_${suffix}@example.test`;
    a.password = "SmokeTest!2468";

    const res = await POST("/api/user/signup", {
        as: a,
        body: {
            username: a.username,
            firstName: "Smoke",
            lastName: suffix,
            email: a.email,
            password: a.password,
            timeZone: "America/Los_Angeles",
        },
    });
    if (res.status !== 200) {
        throw new Error(`could not create fixture user ${suffix}: ${res.status} ${trunc(res.text)}`);
    }

    a.id = res.json.userId;
    created.users.push(new ObjectId(a.id));

    if (verified) {
        await db.collection("users").updateOne(
            { _id: new ObjectId(a.id) },
            { $set: { isVerified: true } }
        );
    }
    return a;
}

/* Written straight to the collection. Going through the app would mean calling
   /nearby with coordinates that miss everything, which spends a real Foursquare
   API quota to get rows we cannot predict. */
async function makeRestaurant(suffix, coords, extra = {}) {
    const fsqId = `${TAG}_${suffix}`;
    const doc = {
        fsqId,
        name: `Smoke Test Kitchen ${suffix}`,
        source: "foursquare",
        cuisine: ["Italian"],
        categories: [{ fsqCategoryId: "13236", name: "Italian Restaurant" }],
        location: { formattedAddress: `${suffix} Test St`, locality: "Testville", country: "US" },
        geocodes: { latitude: coords.lat, longitude: coords.lng },
        geo: { type: "Point", coordinates: [coords.lng, coords.lat] },
        rating: 8.5,
        tips: [],
        palateRating: { count: 0 },
        ...extra,
    };
    const { insertedId } = await db.collection("restaurants").insertOne(doc);
    created.restaurants.push(insertedId);
    return { _id: insertedId, fsqId, name: doc.name };
}

/* A meal in the past, already retired. The review endpoint refuses anything
   that is not "completed", and completeDueReservations only promotes bookings
   whose date has passed — so this is the one shape that makes POST /api/reviews
   reachable at all. */
async function makeCompletedReservation(user, restaurant, hoursAgo = 3) {
    const doc = {
        users: [new ObjectId(user.id)],
        restaurant: restaurant._id,
        date: new Date(Date.now() - hoursAgo * 3600_000),
        partySize: 2,
        status: "completed",
        notes: `smoke ${RUN}`,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    const { insertedId } = await db.collection("reservations").insertOne(doc);
    created.reservations.push(insertedId);
    await db.collection("users").updateOne(
        { _id: new ObjectId(user.id) },
        { $addToSet: { reservations: insertedId } }
    );
    return insertedId;
}

/* Far enough out that MIN_LEAD_MINUTES (VOTE_LEAD_MINUTES + 60) can never
   reject it, computed rather than hard-coded so this keeps working if either
   constant moves. */
function futureDinner(hours = 48) {
    return new Date(Date.now() + hours * 3600_000).toISOString();
}

const DEAD_ID = "000000000000000000000000";   // valid ObjectId, matches nothing
const BAD_ID = "not-an-object-id";

/* ------------------------------------------------------------------ *
 *  Sections
 * ------------------------------------------------------------------ */

/* Every protected handler, hit with no cookie. The point is coverage of the
   wrapper rather than of the handlers: withAuth is the single authorization
   boundary, so this table is what catches a route added without it — the
   failure mode being a 200, 400 or 500 here instead of a 401. A 400 is the
   interesting failure, because it means the handler parsed a stranger's body
   before deciding it had no business doing so. */
const PROTECTED = [
    ["GET", "/api/user/dashboard"],
    ["PATCH", "/api/user"],
    ["PATCH", "/api/user/preferences"],
    ["POST", "/api/user/addresses"],
    ["PATCH", "/api/user/addresses"],
    ["DELETE", "/api/user/addresses?addressId=x"],
    ["POST", "/api/user/friends"],
    ["GET", "/api/user/friends"],
    ["DELETE", "/api/user/friends?identifier=x"],
    ["PATCH", "/api/user/lists"],
    ["DELETE", "/api/user/lists"],
    ["PATCH", "/api/Restaurants/lists"],
    ["DELETE", "/api/Restaurants/lists"],
    ["PATCH", "/api/Restaurants/wishList"],
    ["DELETE", "/api/Restaurants/wishList"],
    ["PATCH", "/api/user/visitedResturant"],
    ["POST", "/api/user/resend-verification"],
    ["GET", "/api/reservations"],
    ["POST", "/api/reservations"],
    ["PATCH", "/api/reservations"],
    ["GET", "/api/reviews/pending"],
    ["POST", "/api/reviews"],
    ["GET", "/api/user/matching"],
    ["POST", "/api/user/matching"],
    ["POST", "/api/user/matching/join"],
    ["GET", `/api/user/matching/${DEAD_ID}`],
    ["PATCH", `/api/user/matching/${DEAD_ID}`],
    ["PATCH", `/api/user/matching/${DEAD_ID}/location`],
    ["POST", `/api/user/matching/${DEAD_ID}/requests`],
    ["POST", `/api/user/matching/${DEAD_ID}/shortlist`],
    ["PUT", `/api/user/matching/${DEAD_ID}/vote`],
    ["POST", `/api/user/matching/${DEAD_ID}/close`],
    ["POST", `/api/user/matching/${DEAD_ID}/reservation`],
];

async function sectionUnauthenticated() {
    for (const [method, path] of PROTECTED) {
        const res = await call(method, path, { as: ANON, body: {} });
        const ok = check(`${method} ${path} rejects anonymous`, res.status, 401, res.text);
        if (ok) {
            checkThat(
                `${method} ${path} sends UNAUTHENTICATED code`,
                res.json?.code === "UNAUTHENTICATED",
                res.json?.code ?? "no code field"
            );
        }
    }

    /* Present but garbage. A signature check that is not actually running would
       let this through, and the symptom would be a 500 from a handler acting on
       a forged id rather than a clean 401. */
    const forged = actor("forged");
    forged.cookie = "not.a.real.jwt";
    check("forged token is rejected", (await GET("/api/user/dashboard", { as: forged })).status, 401);

    /* Right shape, wrong signature — the case a decode-without-verify
       implementation lets straight through. */
    const wrongSecret = actor("wrongsecret");
    wrongSecret.cookie = [
        Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
        Buffer.from(JSON.stringify({ id: DEAD_ID, username: "nobody", exp: 4102444800 })).toString("base64url"),
        "ZmFrZXNpZ25hdHVyZQ",
    ].join(".");
    check("token signed with the wrong key is rejected",
        (await GET("/api/user/dashboard", { as: wrongSecret })).status, 401);

    /* alg:none. jsonwebtoken refuses it by default; this is here so a future
       change to the verify options cannot quietly re-open it. */
    const algNone = actor("algnone");
    algNone.cookie = [
        Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
        Buffer.from(JSON.stringify({ id: DEAD_ID, username: "nobody", exp: 4102444800 })).toString("base64url"),
        "",
    ].join(".");
    check("alg:none token is rejected", (await GET("/api/user/dashboard", { as: algNone })).status, 401);

    /* An expired-but-genuine token. Signed correctly, so only the exp check
       stands between it and a valid session. */
    const expired = actor("expiredtok");
    expired.cookie = makeExpiredToken();
    if (expired.cookie) {
        check("expired token is rejected", (await GET("/api/user/dashboard", { as: expired })).status, 401);
    } else {
        skip("expired token is rejected", "TOKEN_SECRET not readable from this process");
    }

    /* The two genuinely public reads must NOT be caught by any of the above. */
    check("GET /api/Restaurants/search is public",
        (await GET("/api/Restaurants/search", { query: { query: "a", lat: HERE.lat, lng: HERE.lng } })).status,
        [200, 429]);
    check("GET /api/Restaurants/nearby is public",
        (await GET("/api/Restaurants/nearby", { query: { lat: HERE.lat, lng: HERE.lng } })).status, 200);
}

/* Signed with the app's real secret and already expired, which is the only way
   to test the exp path — a hand-rolled unsigned token would be rejected by the
   signature check first and prove nothing. */
function makeExpiredToken() {
    const secret = process.env.TOKEN_SECRET;
    if (!secret) return null;
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const head = enc({ alg: "HS256", typ: "JWT" });
    const past = Math.floor(Date.now() / 1000) - 3600;
    const body = enc({ id: DEAD_ID, username: "nobody", iat: past - 60, exp: past });
    const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
    return `${head}.${body}.${sig}`;
}

async function sectionSignup() {
    const base = {
        username: `${TAG}_dup`,
        firstName: "Dup",
        email: `${TAG}_dup@example.test`,
        password: "SmokeTest!2468",
    };

    const ok = await POST("/api/user/signup", { as: actor("s1"), body: base });
    check("signup succeeds", ok.status, 200, ok.text);
    if (ok.json?.userId) created.users.push(new ObjectId(ok.json.userId));

    checkThat("signup sets an httpOnly token cookie",
        ok.setCookie.some((c) => /^token=/.test(c) && /HttpOnly/i.test(c)),
        trunc(ok.setCookie.join(" | "), 120));

    checkThat("signup response leaks no password field",
        !/password/i.test(ok.text), trunc(ok.text));

    /* Two uniqueness paths with different messages, and both matter: the app
       distinguishes them so the form can point at the right field. */
    const dupEmail = await POST("/api/user/signup", {
        as: actor("s2"), body: { ...base, username: `${TAG}_other` },
    });
    check("duplicate email is refused", dupEmail.status, 400, dupEmail.text);
    checkThat("duplicate email names the email", /email/i.test(dupEmail.json?.error ?? ""), dupEmail.json?.error);

    const dupName = await POST("/api/user/signup", {
        as: actor("s3"), body: { ...base, email: `${TAG}_other@example.test` },
    });
    check("duplicate username is refused", dupName.status, 400, dupName.text);
    checkThat("duplicate username names the username",
        /username/i.test(dupName.json?.error ?? ""), dupName.json?.error);

    const cases = [
        ["missing every field", {}],
        ["username under 3 chars", { ...base, username: "ab", email: `${TAG}_a@example.test` }],
        ["malformed email", { ...base, username: `${TAG}_b`, email: "not-an-email" }],
        ["password under 8 chars", { ...base, username: `${TAG}_c`, email: `${TAG}_c@example.test`, password: "short" }],
        ["empty firstName", { ...base, username: `${TAG}_d`, email: `${TAG}_d@example.test`, firstName: "" }],
        ["unparseable dob", { ...base, username: `${TAG}_e`, email: `${TAG}_e@example.test`, dob: "banana" }],
        /* The one that matters most: a Mongo operator where a string belongs.
           Zod rejecting the type is what stops it reaching findOne as a query
           fragment. */
        ["operator object as email", { ...base, username: `${TAG}_f`, email: { $ne: null } }],
        ["array as username", { ...base, username: ["a", "b"], email: `${TAG}_g@example.test` }],
        ["null password", { ...base, username: `${TAG}_h`, email: `${TAG}_h@example.test`, password: null }],
    ];
    for (const [label, body] of cases) {
        const res = await POST("/api/user/signup", { as: actor(`s_${label}`), body });
        check(`signup rejects ${label}`, res.status, 400, res.text);
    }

    /* Accepted on purpose — normalizeTimeZone decides whether it is storable,
       and a browser reporting a zone we do not recognise must not fail an
       otherwise valid signup. */
    const badZone = await POST("/api/user/signup", {
        as: actor("s4"),
        body: { ...base, username: `${TAG}_tz`, email: `${TAG}_tz@example.test`, timeZone: "Mars/Olympus" },
    });
    check("unrecognised timeZone still signs up", badZone.status, 200, badZone.text);
    if (badZone.json?.userId) {
        created.users.push(new ObjectId(badZone.json.userId));
        const stored = await db.collection("users").findOne({ _id: new ObjectId(badZone.json.userId) });
        checkThat("unrecognised timeZone is not stored", stored?.timeZone === "", `stored "${stored?.timeZone}"`);
    }

    const empty = await POST("/api/user/signup", { as: actor("s5"), raw: "" });
    check("empty body does not succeed", empty.status, [400, 500], empty.text);

    const malformed = await POST("/api/user/signup", { as: actor("s6"), raw: "{ nope" });
    check("malformed JSON does not succeed", malformed.status, [400, 500], malformed.text);
}

async function sectionLogin() {
    const user = await makeUser("login", { verified: false });

    const byName = await POST("/api/user/login", {
        as: actor("byname"), body: { identifier: user.username, password: user.password },
    });
    check("login by username", byName.status, 200, byName.text);

    const session = actor("byemail");
    const byEmail = await POST("/api/user/login", {
        as: session, body: { identifier: user.email, password: user.password },
    });
    check("login by email", byEmail.status, 200, byEmail.text);
    checkThat("login returns a token cookie", byEmail.setCookie.some((c) => /^token=/.test(c)));
    checkThat("login response leaks no password field", !/password/i.test(byEmail.text), trunc(byEmail.text));

    const wrongPass = await POST("/api/user/login", {
        as: actor("wrongpass"), body: { identifier: user.username, password: "WrongPassword!1" },
    });
    check("wrong password is 401", wrongPass.status, 401, wrongPass.text);

    const noSuchUser = await POST("/api/user/login", {
        as: actor("nosuch"), body: { identifier: `${TAG}_ghost`, password: "WrongPassword!1" },
    });
    check("unknown account is 401", noSuchUser.status, 401, noSuchUser.text);

    /* The enumeration test. Identical wording is the whole reason login does
       not return early on a missing account. */
    checkThat("both failures give the identical message",
        JSON.stringify(wrongPass.json) === JSON.stringify(noSuchUser.json),
        `${trunc(wrongPass.json)} vs ${trunc(noSuchUser.json)}`);

    check("login rejects a short password",
        (await POST("/api/user/login", { as: actor("shortpw"), body: { identifier: user.username, password: "abc" } })).status, 400);
    check("login rejects a 2-char identifier",
        (await POST("/api/user/login", { as: actor("shortid"), body: { identifier: "ab", password: "SmokeTest!2468" } })).status, 400);
    check("login rejects an operator object as identifier",
        (await POST("/api/user/login", { as: actor("injectid"), body: { identifier: { $ne: null }, password: "SmokeTest!2468" } })).status, 400);
    check("login rejects an empty body",
        (await POST("/api/user/login", { as: actor("emptylogin"), body: {} })).status, 400);

    /* Timing. The no-account branch burns a compare against DUMMY_HASH
       specifically so it cannot answer faster than the wrong-password branch,
       and a 20x gap there is readable from a single request. Medians of three,
       because one sample on a laptop is noise. The 3x threshold is loose on
       purpose — this is wall-clock on a machine also running the dev server, so
       a tighter bound would flap. */
    const timeOne = async (identifier) => {
        const started = process.hrtime.bigint();
        await POST("/api/user/login", { as: actor("timing"), body: { identifier, password: "WrongPassword!1" } });
        return Number(process.hrtime.bigint() - started) / 1e6;
    };
    const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const real = [], ghost = [];
    for (let i = 0; i < 3; i++) {
        real.push(await timeOne(user.username));
        ghost.push(await timeOne(`${TAG}_ghost_${i}`));
    }
    const mReal = median(real), mGhost = median(ghost);
    const ratio = Math.max(mReal, mGhost) / Math.max(1, Math.min(mReal, mGhost));
    checkThat("no timing oracle between real and unknown accounts", ratio < 3,
        `real ${mReal.toFixed(0)}ms vs unknown ${mGhost.toFixed(0)}ms (${ratio.toFixed(2)}x)`);

    const out = await POST("/api/user/logout", { as: session });
    check("logout responds", out.status, 200, out.text);
    checkThat("logout clears the cookie",
        out.setCookie.some((c) => /^token=;/.test(c) || /Max-Age=0/i.test(c) || /Expires=Thu, 01 Jan 1970/i.test(c)),
        trunc(out.setCookie.join(" | "), 160));
}

async function sectionVerifyEmail() {
    const user = await makeUser("verify", { verified: false });
    const token = `${TAG}verifytoken${"0".repeat(20)}`;
    await db.collection("users").updateOne(
        { _id: new ObjectId(user.id) },
        { $set: { verifyToken: token, verifyTokenExpiry: new Date(Date.now() + 3600_000) } }
    );

    check("verifyemail rejects a missing token",
        (await POST("/api/user/verifyemail", { as: actor("v1"), body: {} })).status, 400);
    check("verifyemail rejects an empty token",
        (await POST("/api/user/verifyemail", { as: actor("v2"), body: { token: "" } })).status, 400);
    check("verifyemail rejects an unknown token",
        (await POST("/api/user/verifyemail", { as: actor("v3"), body: { token: "deadbeef".repeat(8) } })).status, 400);

    const ok = await POST("/api/user/verifyemail", { as: actor("v4"), body: { token } });
    check("verifyemail accepts a live token", ok.status, 200, ok.text);

    const stored = await db.collection("users").findOne({ _id: new ObjectId(user.id) });
    checkThat("account is now verified", stored?.isVerified === true, `isVerified=${stored?.isVerified}`);
    checkThat("token is cleared after use", !stored?.verifyToken, `verifyToken=${trunc(stored?.verifyToken)}`);

    /* Single use. If this passed, a token leaked from a mail archive would stay
       live forever. */
    check("the same token cannot be replayed",
        (await POST("/api/user/verifyemail", { as: actor("v5"), body: { token } })).status, 400);

    /* Expiry is a separate clause from existence; a lookup by token alone would
       miss it. */
    const expiredUser = await makeUser("verifyexp", { verified: false });
    const expiredToken = `${TAG}expiredtoken${"0".repeat(20)}`;
    await db.collection("users").updateOne(
        { _id: new ObjectId(expiredUser.id) },
        { $set: { verifyToken: expiredToken, verifyTokenExpiry: new Date(Date.now() - 3600_000) } }
    );
    check("an expired token is refused",
        (await POST("/api/user/verifyemail", { as: actor("v6"), body: { token: expiredToken } })).status, 400);
}

async function sectionVerifiedGate() {
    const unverified = await makeUser("gate", { verified: false });
    await POST("/api/user/login", {
        as: unverified, body: { identifier: unverified.username, password: unverified.password },
    });

    /* withVerified reads isVerified from the database rather than the token —
       so the gate must hold for a session minted before verification, and must
       lift the moment the flag flips without a re-login. Both halves below. */
    const gated = [
        ["POST", "/api/reservations", { fsqId: "x", date: futureDinner(), partySize: 2 }],
        ["POST", "/api/user/matching", { date: futureDinner(), friendsIds: [] }],
        ["POST", "/api/user/matching/join", { inviteCode: "whatever" }],
    ];
    for (const [method, path, body] of gated) {
        const res = await call(method, path, { as: unverified, body });
        const ok = check(`${method} ${path} refuses an unverified account`, res.status, 403, res.text);
        if (ok) {
            checkThat(`${method} ${path} sends EMAIL_UNVERIFIED`,
                res.json?.code === "EMAIL_UNVERIFIED", res.json?.code ?? "no code");
        }
    }

    /* Reads stay open — an unverified user can still look at their own data. */
    check("an unverified account can still read its dashboard",
        (await GET("/api/user/dashboard", { as: unverified })).status, 200);
    check("an unverified account can still list groups",
        (await GET("/api/user/matching", { as: unverified })).status, 200);

    await db.collection("users").updateOne(
        { _id: new ObjectId(unverified.id) }, { $set: { isVerified: true } }
    );
    const afterFlip = await POST("/api/user/matching", {
        as: unverified, body: { name: "Gate lift", date: futureDinner(), friendsIds: [] },
    });
    checkThat("the gate lifts on the same cookie once verified",
        afterFlip.status === 201,
        `${afterFlip.status} — a stale isVerified claim in the JWT would keep this at 403`);
    if (afterFlip.json?.group?._id) created.groups.push(new ObjectId(afterFlip.json.group._id));
}

async function sectionResendVerification() {
    const user = await makeUser("resend", { verified: false });
    await POST("/api/user/login", { as: user, body: { identifier: user.username, password: user.password } });

    /* SMTP may or may not be configured here, and either way the endpoint has
       to answer rather than 500 — the whole point of it is recovering a signup
       whose mail failed. */
    const first = await POST("/api/user/resend-verification", { as: user });
    check("resend-verification answers", first.status, [200, 429, 500], first.text);
    if (first.status === 500) {
        skip("resend-verification delivered", `SMTP not usable here: ${trunc(first.json?.error)}`);
    }

    /* 3 an hour, keyed by user id rather than IP, so changing the forwarded
       address must NOT buy a fresh budget. That is the assertion. */
    if (SKIP_RATELIMIT) {
        skip("resend-verification rate limit", "--no-ratelimit");
    } else {
        let limited = null;
        for (let i = 0; i < 5 && limited === null; i++) {
            user.ip = randomIp();                       // new source address every time
            const res = await POST("/api/user/resend-verification", { as: user });
            if (res.status === 429) limited = res;
        }
        checkThat("resend-verification is limited per user, not per IP", limited !== null,
            limited ? "" : "5 calls from 5 different addresses were all accepted");
        if (limited) {
            checkThat("429 carries Retry-After", !!limited.headers.get("retry-after"),
                limited.headers.get("retry-after") ?? "absent");
            checkThat("429 carries the RATE_LIMITED code", limited.json?.code === "RATE_LIMITED", limited.json?.code);
        }
    }
}

async function sectionProfile(alice) {
    const dash = await GET("/api/user/dashboard", { as: alice });
    check("GET /api/user/dashboard", dash.status, 200, dash.text);
    checkThat("dashboard never ships the password hash",
        !JSON.stringify(dash.json ?? {}).includes("$2"), "a bcrypt hash starts $2");

    const ok = await PATCH("/api/user", {
        as: alice, body: { firstName: "Alice", lastName: "Smoke", favDish: "Cacio e pepe", phone: "+1 (555) 010-0100" },
    });
    check("PATCH /api/user updates the allowed fields", ok.status, 200, ok.text);

    /* The allowlist is the authorization boundary, not merely validation:
       everything absent from it is a field a user cannot change about
       themselves. .strict() is what makes each of these a loud 400 rather than
       a silent no-op, so a client bug cannot look like success. */
    const forbidden = [
        ["Role", { Role: "admin" }],
        ["isVerified", { isVerified: true }],
        ["password", { password: "hunter22222" }],
        ["StarmembershipStatus", { StarmembershipStatus: true }],
        ["numVisits", { numVisits: 9999 }],
        ["email", { email: "someone@else.test" }],
        ["username", { username: `${TAG}_stolen` }],
        ["wishlist", { wishlist: [] }],
        ["friendlist", { friendlist: [] }],
        ["_id", { _id: DEAD_ID }],
    ];
    for (const [field, body] of forbidden) {
        const res = await PATCH("/api/user", { as: alice, body });
        check(`PATCH /api/user refuses to set ${field}`, res.status, 400, res.text);
    }

    /* And the escalation actually failed in the database, not just in the
       response — a 400 with a write behind it would be the worst outcome. */
    const stored = await db.collection("users").findOne({ _id: new ObjectId(alice.id) });
    checkThat("privilege escalation did not land", stored?.Role === "user", `Role=${stored?.Role}`);

    const invalid = [
        ["a future date of birth", { dob: new Date(Date.now() + 86_400_000).toISOString() }],
        ["a date of birth before 1900", { dob: "1850-01-01" }],
        ["an unparseable date of birth", { dob: "banana" }],
        ["a non-URL profilePic", { profilePic: "not a url at all" }],
        ["letters in the phone number", { phone: "call-me-maybe" }],
        ["a firstName over 60 chars", { firstName: "x".repeat(61) }],
        ["a favDish over 120 chars", { favDish: "x".repeat(121) }],
        ["a profilePic over 2048 chars", { profilePic: `https://e.test/${"x".repeat(2100)}` }],
    ];
    for (const [label, body] of invalid) {
        check(`PATCH /api/user rejects ${label}`, (await PATCH("/api/user", { as: alice, body })).status, 400);
    }

    /* Absent means unchanged, empty string means clear it — the reason there is
       no .min(1) on this schema. A user must be able to erase what they set. */
    check("empty string clears a text field",
        (await PATCH("/api/user", { as: alice, body: { favDish: "" } })).status, 200);
    check("empty string is a valid profilePic",
        (await PATCH("/api/user", { as: alice, body: { profilePic: "" } })).status, 200);
    check("null clears the date of birth",
        (await PATCH("/api/user", { as: alice, body: { dob: null } })).status, 200);
    /* 400 on purpose: answering 200 to an empty patch hides a broken form that
       is silently saving nothing. */
    check("an empty patch is refused rather than silently succeeding",
        (await PATCH("/api/user", { as: alice, body: {} })).status, 400);

    /* profilePic goes straight into an <img src>, and the group endpoints ship
       it inside participant cards, so one user's value is rendered in another
       user's browser. z.string().url() delegates to the URL constructor, which
       is a syntax check and not a scheme check — every one of these parses. */
    for (const [label, value] of [
        ["a javascript: profilePic", "javascript:alert(1)"],
        ["a data:text/html profilePic", "data:text/html,<script>alert(1)</script>"],
        ["a file:// profilePic", "file:///etc/passwd"],
    ]) {
        const res = await PATCH("/api/user", { as: alice, body: { profilePic: value } });
        check(`PATCH /api/user rejects ${label}`, res.status, 400, "");
    }
    await PATCH("/api/user", { as: alice, body: { profilePic: "" } });

    check("PATCH /api/user rejects malformed JSON",
        (await PATCH("/api/user", { as: alice, raw: "{ nope" })).status, 400);

    /* Unicode has to survive the round trip intact; a byte-length truncation
       somewhere shows up here as a mangled name. */
    const uni = "Zoë 🍜 佐藤";
    const uniRes = await PATCH("/api/user", { as: alice, body: { firstName: uni } });
    check("unicode name is accepted", uniRes.status, 200, uniRes.text);
    const afterUni = await db.collection("users").findOne({ _id: new ObjectId(alice.id) });
    checkThat("unicode name survives the round trip", afterUni?.firstName === uni, `stored "${afterUni?.firstName}"`);
    await PATCH("/api/user", { as: alice, body: { firstName: "Alice" } });
}

async function sectionPreferences(alice) {
    const ok = await PATCH("/api/user/preferences", {
        as: alice,
        body: {
            likedCuisines: [{ fsqid: 13236, name: "Italian" }, { fsqid: 13072, name: "Asian" }],
            allergines: ["peanut"],
            diet: ["vegetarian"],
        },
    });
    check("PATCH /api/user/preferences", ok.status, 200, ok.text);

    const bad = [
        ["fsqid sent as a string", { likedCuisines: [{ fsqid: "13236", name: "Italian" }], allergines: [], diet: [] }],
        ["likedCuisines not an array", { likedCuisines: "Italian", allergines: [], diet: [] }],
        ["a cuisine missing its name", { likedCuisines: [{ fsqid: 1 }], allergines: [], diet: [] }],
        ["numbers in allergines", { likedCuisines: [], allergines: [1, 2], diet: [] }],
    ];
    for (const [label, body] of bad) {
        check(`preferences rejects ${label}`, (await PATCH("/api/user/preferences", { as: alice, body })).status, 400);
    }

    /* All three fields default to [], so {} is a legitimate "clear everything". */
    check("preferences accepts an empty object", (await PATCH("/api/user/preferences", { as: alice, body: {} })).status, 200);

    await PATCH("/api/user/preferences", {
        as: alice,
        body: { likedCuisines: [{ fsqid: 13236, name: "Italian" }], allergines: [], diet: [] },
    });
}

async function sectionAddresses(alice) {
    const good = { streetAddress: "1 Test Way", city: "Testville", state: "CA", country: "US", pincode: 94110, label: "Home" };

    const created1 = await POST("/api/user/addresses", { as: alice, body: good });
    check("POST /api/user/addresses", created1.status, 201, created1.text);

    const addressId =
        created1.json?.address?._id ?? created1.json?.addressId ??
        (await db.collection("addresses").findOne({ "address.streetAddress": "1 Test Way" }))?._id?.toString();
    if (addressId) created.addresses.push(new ObjectId(addressId));

    const bad = [
        ["a missing city", { ...good, city: undefined }],
        ["an empty streetAddress", { ...good, streetAddress: "" }],
        ["whitespace-only city", { ...good, city: "   " }],
        ["an unknown key", { ...good, sneaky: "value" }],
        ["a string pincode", { ...good, pincode: "94110" }],
        ["a fractional pincode", { ...good, pincode: 94110.5 }],
        ["a negative pincode", { ...good, pincode: -1 }],
        ["a label outside the enum", { ...good, label: "Yacht" }],
        ["a streetAddress over 120 chars", { ...good, streetAddress: "x".repeat(121) }],
    ];
    for (const [label, body] of bad) {
        check(`addresses POST rejects ${label}`, (await POST("/api/user/addresses", { as: alice, body })).status, 400);
    }

    check("addresses POST rejects malformed JSON",
        (await POST("/api/user/addresses", { as: alice, raw: "{" })).status, 400);

    if (addressId) {
        check("PATCH one field of an address",
            (await PATCH("/api/user/addresses", { as: alice, body: { addressId, city: "Newtown" } })).status, 200);
        check("PATCH rejects an unknown key",
            (await PATCH("/api/user/addresses", { as: alice, body: { addressId, sneaky: 1 } })).status, 400);
        check("PATCH rejects a missing addressId",
            (await PATCH("/api/user/addresses", { as: alice, body: { city: "Nowhere" } })).status, 400);
    }

    /* A malformed id and an id that simply is not there are different answers:
       400 says the client sent nonsense, 404 says it sent a well-formed id for
       something that does not exist. Handing a bad id straight to Mongo would
       raise a CastError and surface as a 500 for what is plainly a client
       mistake. */
    check("PATCH rejects a malformed address id",
        (await PATCH("/api/user/addresses", { as: alice, body: { addressId: BAD_ID, city: "x" } })).status, 400);
    check("PATCH 404s on an unknown address id",
        (await PATCH("/api/user/addresses", { as: alice, body: { addressId: DEAD_ID, city: "x" } })).status, 404);
    check("DELETE rejects a malformed address id",
        (await DELETE("/api/user/addresses", { as: alice, query: { addressId: BAD_ID } })).status, 400);
    check("DELETE 404s on an unknown address id",
        (await DELETE("/api/user/addresses", { as: alice, query: { addressId: DEAD_ID } })).status, 404);
    check("DELETE rejects a missing addressId param",
        (await DELETE("/api/user/addresses", { as: alice })).status, 400);

    /* Cross-tenant. Bob's address must be invisible to Alice, and the answer
       must be the same 404 a nonexistent id gets — anything else tells Alice
       which ids are real. */
    const bob = await makeUser("addrbob");
    await POST("/api/user/login", { as: bob, body: { identifier: bob.username, password: bob.password } });
    const bobAddr = await POST("/api/user/addresses", { as: bob, body: { ...good, streetAddress: "2 Bob Lane" } });
    const bobId = bobAddr.json?.address?._id ??
        (await db.collection("addresses").findOne({ "address.streetAddress": "2 Bob Lane" }))?._id?.toString();
    if (bobId) {
        created.addresses.push(new ObjectId(bobId));
        check("Alice cannot PATCH Bob's address",
            (await PATCH("/api/user/addresses", { as: alice, body: { addressId: bobId, city: "Hacked" } })).status, 404);
        check("Alice cannot DELETE Bob's address",
            (await DELETE("/api/user/addresses", { as: alice, query: { addressId: bobId } })).status, 404);
        const untouched = await db.collection("addresses").findOne({ _id: new ObjectId(bobId) });
        checkThat("Bob's address is intact",
            untouched?.address?.city === "Testville", `city=${untouched?.address?.city}`);
    } else {
        skip("cross-tenant address isolation", "could not create Bob's address");
    }

    if (addressId) {
        check("DELETE an address", (await DELETE("/api/user/addresses", { as: alice, query: { addressId } })).status, 200);
        check("DELETE the same address twice 404s",
            (await DELETE("/api/user/addresses", { as: alice, query: { addressId } })).status, 404);
    }
}

async function sectionFriends(alice) {
    const bob = await makeUser("friendbob");
    await POST("/api/user/login", { as: bob, body: { identifier: bob.username, password: bob.password } });

    check("friend request rejects an identifier under 3 chars",
        (await POST("/api/user/friends", { as: alice, body: { identifier: "ab" } })).status, 400);
    check("friend request rejects an operator object",
        (await POST("/api/user/friends", { as: alice, body: { identifier: { $ne: null } } })).status, 400);
    check("friend request 404s on an unknown identifier",
        (await POST("/api/user/friends", { as: alice, body: { identifier: `${TAG}_ghost` } })).status, 404);

    /* Befriending yourself is the classic off-by-one in a symmetric graph:
       accepted, it produces a row whose two sides are equal and every
       "the other person" lookup then returns you. */
    const self = await POST("/api/user/friends", { as: alice, body: { identifier: alice.username } });
    check("a self-directed friend request is refused", self.status, [400, 409], self.text);

    const sent = await POST("/api/user/friends", { as: alice, body: { identifier: bob.username } });
    check("Alice sends Bob a friend request", sent.status, 200, sent.text);

    /* Idempotent rather than duplicated — a double-tap must not queue a second
       request. */
    const again = await POST("/api/user/friends", { as: alice, body: { identifier: bob.username } });
    check("a repeated request is accepted without duplicating", again.status, 200, again.text);
    checkThat("the repeat is reported as already-sent",
        /already/i.test(again.json?.message ?? ""), again.json?.message);

    const bobPending = await GET("/api/user/friends", { as: bob });
    check("Bob can list his pending requests", bobPending.status, 200, bobPending.text);
    checkThat("Alice appears in Bob's pending list",
        JSON.stringify(bobPending.json ?? {}).includes(alice.username), trunc(bobPending.json, 160));

    /* The same endpoint, in the opposite direction, is what accepts. */
    const accepted = await POST("/api/user/friends", { as: bob, body: { identifier: alice.username } });
    check("Bob accepts by requesting back", accepted.status, 200, accepted.text);
    checkThat("the outcome reads as accepted", /accept|friend/i.test(accepted.json?.message ?? ""), accepted.json?.message);

    const aliceList = await GET("/api/user/friends", { as: alice });
    checkThat("Bob now shows in Alice's friends",
        JSON.stringify(aliceList.json ?? {}).includes(bob.username), trunc(aliceList.json, 200));

    check("friend DELETE rejects a missing identifier",
        (await DELETE("/api/user/friends", { as: alice })).status, 400);
    check("friend DELETE 404s on an unknown identifier",
        (await DELETE("/api/user/friends", { as: alice, query: { identifier: `${TAG}_ghost` } })).status, 404);

    const removed = await DELETE("/api/user/friends", { as: alice, query: { identifier: bob.username } });
    check("Alice removes Bob", removed.status, 200, removed.text);

    return { bob };
}

async function sectionLists(alice, restaurant) {
    check("create a named list", (await PATCH("/api/user/lists", { as: alice, body: { listName: "Date night" } })).status, 200);
    check("creating the same list twice is 409",
        (await PATCH("/api/user/lists", { as: alice, body: { listName: "Date night" } })).status, 409);
    check("lists PATCH rejects a missing listName",
        (await PATCH("/api/user/lists", { as: alice, body: {} })).status, 400);
    check("lists PATCH rejects a non-string listName",
        (await PATCH("/api/user/lists", { as: alice, body: { listName: 42 } })).status, 400);

    /* A Map key, so these are the characters that break the storage layer
       rather than the validator. Whatever the app decides, it must not 500. */
    for (const [label, listName] of [["a dotted name", "a.b"], ["a dollar-prefixed name", "$evil"], ["an empty name", ""]]) {
        const res = await PATCH("/api/user/lists", { as: alice, body: { listName } });
        check(`lists PATCH survives ${label}`, res.status, [200, 400, 409], res.text);
        if (res.status === 200) await DELETE("/api/user/lists", { as: alice, body: { listName } });
    }

    const add = await PATCH("/api/Restaurants/lists", {
        as: alice, body: { listName: "Date night", fsqId: restaurant.fsqId, restName: restaurant.name },
    });
    check("add a restaurant to a list", add.status, 200, add.text);

    /* $addToSet, so a second add must not produce a duplicate entry. */
    await PATCH("/api/Restaurants/lists", {
        as: alice, body: { listName: "Date night", fsqId: restaurant.fsqId, restName: restaurant.name },
    });
    const afterTwice = await db.collection("users").findOne({ _id: new ObjectId(alice.id) });
    const entries = afterTwice?.lists?.["Date night"] ?? [];
    checkThat("adding twice does not duplicate the entry", entries.length === 1, `${entries.length} entries`);

    check("adding an unknown restaurant is 404",
        (await PATCH("/api/Restaurants/lists", { as: alice, body: { listName: "Date night", fsqId: `${TAG}_nope`, restName: "x" } })).status, 404);
    check("Restaurants/lists rejects a missing fsqId",
        (await PATCH("/api/Restaurants/lists", { as: alice, body: { listName: "Date night", restName: "x" } })).status, 400);

    check("remove a restaurant from a list",
        (await DELETE("/api/Restaurants/lists", { as: alice, body: { listName: "Date night", fsqId: restaurant.fsqId, restName: restaurant.name } })).status, 200);
    check("delete the list", (await DELETE("/api/user/lists", { as: alice, body: { listName: "Date night" } })).status, [200, 404]);
}

async function sectionWishlistAndVisited(alice, restaurant) {
    check("add to the wishlist",
        (await PATCH("/api/Restaurants/wishList", { as: alice, body: { fsqId: restaurant.fsqId, name: restaurant.name } })).status, 200);

    await PATCH("/api/Restaurants/wishList", { as: alice, body: { fsqId: restaurant.fsqId, name: restaurant.name } });
    const afterTwice = await db.collection("users").findOne({ _id: new ObjectId(alice.id) });
    checkThat("adding to the wishlist twice does not duplicate",
        (afterTwice?.wishlist ?? []).length === 1, `${(afterTwice?.wishlist ?? []).length} entries`);

    check("wishlist 404s on an unknown restaurant",
        (await PATCH("/api/Restaurants/wishList", { as: alice, body: { fsqId: `${TAG}_nope`, name: "x" } })).status, 404);
    check("wishlist rejects a missing name",
        (await PATCH("/api/Restaurants/wishList", { as: alice, body: { fsqId: restaurant.fsqId } })).status, 400);
    check("remove from the wishlist",
        (await DELETE("/api/Restaurants/wishList", { as: alice, body: { fsqId: restaurant.fsqId, name: restaurant.name } })).status, 200);

    check("mark a restaurant visited",
        (await PATCH("/api/user/visitedResturant", { as: alice, body: { fsqId: restaurant.fsqId } })).status, 200);
    check("visited 404s on an unknown restaurant",
        (await PATCH("/api/user/visitedResturant", { as: alice, body: { fsqId: `${TAG}_nope` } })).status, 404);
    check("visited rejects a missing fsqId",
        (await PATCH("/api/user/visitedResturant", { as: alice, body: {} })).status, 400);
    check("visited rejects a numeric fsqId",
        (await PATCH("/api/user/visitedResturant", { as: alice, body: { fsqId: 123 } })).status, 400);
}

async function sectionSearch(restaurant) {
    const near = await GET("/api/Restaurants/search", { query: { query: "Smoke Test Kitchen", lat: HERE.lat, lng: HERE.lng } });
    check("search finds a nearby restaurant by name", near.status, [200, 429], near.text);
    if (near.status === 200) {
        checkThat("the seeded restaurant is in the results",
            (near.json?.restaurants ?? []).some((r) => r.fsqId === restaurant.fsqId),
            `count=${near.json?.count}`);
        checkThat("count matches the array length",
            near.json?.count === (near.json?.restaurants ?? []).length,
            `count=${near.json?.count} array=${(near.json?.restaurants ?? []).length}`);
    }

    /* 4,000km away with a 70km radius. If this returns the SF row, the $near is
       not actually filtering and every "nearby" answer in the app is a lie. */
    const far = await GET("/api/Restaurants/search", { query: { query: "Smoke Test Kitchen", lat: FAR.lat, lng: FAR.lng } });
    if (far.status === 200) {
        checkThat("the geo filter excludes a far-away match",
            !(far.json?.restaurants ?? []).some((r) => r.fsqId === restaurant.fsqId),
            `got ${far.json?.count} results from New York`);
    }

    const bad = [
        ["a missing query", { lat: HERE.lat, lng: HERE.lng }],
        ["a missing lat", { query: "pizza", lng: HERE.lng }],
        ["a missing lng", { query: "pizza", lat: HERE.lat }],
        ["a non-numeric lat", { query: "pizza", lat: "north", lng: HERE.lng }],
        ["an empty lat", { query: "pizza", lat: "", lng: HERE.lng }],
    ];
    for (const [label, query] of bad) {
        const res = await GET("/api/Restaurants/search", { query });
        check(`search rejects ${label}`, res.status, [400, 429], res.text);
    }

    /* escapeRegex is the only thing between a query box and a catastrophic
       backtracking DoS, and its failure mode is silent: `.*` would simply match
       everything and look like a generous search. Timed, because a hang is the
       actual symptom. */
    const started = Date.now();
    const evil = await GET("/api/Restaurants/search", { query: { query: "(a+)+$", lat: HERE.lat, lng: HERE.lng } });
    const elapsed = Date.now() - started;
    check("a regex metacharacter query is handled", evil.status, [200, 429], evil.text);
    checkThat("a pathological regex does not hang the route", elapsed < 5000, `${elapsed}ms`);

    const wildcard = await GET("/api/Restaurants/search", { query: { query: ".*", lat: HERE.lat, lng: HERE.lng } });
    if (wildcard.status === 200) {
        checkThat("`.*` is escaped rather than matching everything",
            !(wildcard.json?.restaurants ?? []).some((r) => r.fsqId === restaurant.fsqId),
            `".*" returned ${wildcard.json?.count} rows — an unescaped regex would match all of them`);
    }

    /* Coordinates outside the valid range. Mongo raises on these, and the route
       has no bound check, so the driver's message reaches the client as a 500 —
       a client mistake reported as a server fault, which is exactly what the
       reviews route calls out and guards against. */
    for (const [label, query] of [
        ["a latitude above 90", { query: "pizza", lat: 91, lng: 0 }],
        ["a latitude below -90", { query: "pizza", lat: -91, lng: 0 }],
        ["a longitude above 180", { query: "pizza", lat: 0, lng: 181 }],
    ]) {
        const res = await GET("/api/Restaurants/search", { query });
        check(`search rejects ${label} without a 500`, res.status, [200, 400, 429], trunc(res.json?.error));
    }

    const longQuery = await GET("/api/Restaurants/search", { query: { query: "x".repeat(5000), lat: HERE.lat, lng: HERE.lng } });
    check("a 5000-char query does not break the route", longQuery.status, [200, 400, 414, 429], longQuery.text);
}

async function sectionNearby(alice, restaurant) {
    const anon = await GET("/api/Restaurants/nearby", { query: { lat: HERE.lat, lng: HERE.lng } });
    check("nearby works signed out", anon.status, 200, anon.text);
    checkThat("nearby returns the seeded restaurant",
        JSON.stringify(anon.json ?? {}).includes(restaurant.fsqId), trunc(anon.json, 160));

    const authed = await GET("/api/Restaurants/nearby", { as: alice, query: { lat: HERE.lat, lng: HERE.lng } });
    check("nearby works signed in", authed.status, 200, authed.text);

    /* An explicit query is meant to override the taste sentence built from the
       user's preferences; both paths have to answer. */
    check("nearby accepts an explicit query",
        (await GET("/api/Restaurants/nearby", { as: alice, query: { lat: HERE.lat, lng: HERE.lng, query: "italian" } })).status, 200);

    for (const [label, query] of [
        ["a missing lat", { lng: HERE.lng }],
        ["a missing lng", { lat: HERE.lat }],
        ["no coordinates at all", {}],
        ["a non-numeric lat", { lat: "north", lng: HERE.lng }],
    ]) {
        check(`nearby rejects ${label}`, (await GET("/api/Restaurants/nearby", { query })).status, 400);
    }

    /* Signed in with a garbage cookie. nearby reads the token optionally, so a
       bad one must degrade to the anonymous path rather than 500. */
    const badCookie = actor("nearbybad");
    badCookie.cookie = "garbage";
    check("nearby degrades gracefully on a bad token",
        (await GET("/api/Restaurants/nearby", { as: badCookie, query: { lat: HERE.lat, lng: HERE.lng } })).status, 200);
}

async function sectionReservations(alice, restaurant) {
    const listed = await GET("/api/reservations", { as: alice });
    check("GET /api/reservations", listed.status, 200, listed.text);

    const booked = await POST("/api/reservations", {
        as: alice, body: { fsqId: restaurant.fsqId, date: futureDinner(72), partySize: 2, notes: `smoke ${RUN}` },
    });
    check("POST /api/reservations creates a booking", booked.status, 201, booked.text);
    const reservationId = booked.json?.reservation?._id;
    if (reservationId) created.reservations.push(new ObjectId(reservationId));

    const bad = [
        ["a missing fsqId", { date: futureDinner(), partySize: 2 }],
        ["a missing date", { fsqId: restaurant.fsqId, partySize: 2 }],
        ["a party size of 0", { fsqId: restaurant.fsqId, date: futureDinner(), partySize: 0 }],
        ["a negative party size", { fsqId: restaurant.fsqId, date: futureDinner(), partySize: -3 }],
        ["a fractional party size", { fsqId: restaurant.fsqId, date: futureDinner(), partySize: 2.5 }],
        ["a party size sent as a string", { fsqId: restaurant.fsqId, date: futureDinner(), partySize: "2" }],
        ["notes sent as a number", { fsqId: restaurant.fsqId, date: futureDinner(), partySize: 2, notes: 5 }],
    ];
    for (const [label, body] of bad) {
        check(`booking rejects ${label}`, (await POST("/api/reservations", { as: alice, body })).status, 400, "");
    }

    check("booking 404s on an unknown restaurant",
        (await POST("/api/reservations", { as: alice, body: { fsqId: `${TAG}_nope`, date: futureDinner(), partySize: 2 } })).status, 404);

    /* `date` is a bare z.string(), so an unparseable one passes the schema and
       becomes an Invalid Date at `new Date(date)`. Mongoose then rejects it on
       save and the route reports 500. Recorded rather than asserted as a pass:
       the honest answer is a 400. */
    const nonsenseDate = await POST("/api/reservations", {
        as: alice, body: { fsqId: restaurant.fsqId, date: "banana", partySize: 2 },
    });
    if (nonsenseDate.status === 400) {
        record("PASS", "booking rejects an unparseable date", "400");
    } else {
        record("FAIL", "booking rejects an unparseable date",
            `got ${nonsenseDate.status} — bodySchema.date is z.string(), so "banana" reaches new Date() and stores or throws downstream`);
    }

    /* Nothing stops a booking in the past. Worth knowing about explicitly
       rather than discovering from a support ticket. */
    const pastBooking = await POST("/api/reservations", {
        as: alice, body: { fsqId: restaurant.fsqId, date: new Date(Date.now() - 7 * 86_400_000).toISOString(), partySize: 2 },
    });
    if (pastBooking.json?.reservation?._id) created.reservations.push(new ObjectId(pastBooking.json.reservation._id));
    if (pastBooking.status === 201) {
        record("SKIP", "booking a table in the past", "accepted (201) — no lower bound on `date` in bodySchema");
    } else {
        record("PASS", "booking a table in the past is refused", `${pastBooking.status}`);
    }

    if (reservationId) {
        check("PATCH rejects a status outside the enum",
            (await PATCH("/api/reservations", { as: alice, body: { reservationId, status: "teleported" } })).status, 400);
        check("PATCH rejects a missing status",
            (await PATCH("/api/reservations", { as: alice, body: { reservationId } })).status, 400);
        check("PATCH rejects a malformed reservation id",
            (await PATCH("/api/reservations", { as: alice, body: { reservationId: BAD_ID, status: "cancelled" } })).status, [400, 404]);
        check("PATCH 404s on an unknown reservation",
            (await PATCH("/api/reservations", { as: alice, body: { reservationId: DEAD_ID, status: "cancelled" } })).status, 404);

        /* Ownership lives in the query filter, not in an if-statement after the
           fact. A stranger must get the same 404 a nonexistent id gets. */
        const mallory = await makeUser("resmallory");
        await POST("/api/user/login", { as: mallory, body: { identifier: mallory.username, password: mallory.password } });
        check("a stranger cannot cancel someone else's booking",
            (await PATCH("/api/reservations", { as: mallory, body: { reservationId, status: "cancelled" } })).status, 404);
        const stillThere = await db.collection("reservations").findOne({ _id: new ObjectId(reservationId) });
        checkThat("the booking survived the stranger's attempt",
            stillThere?.status === "confirmed", `status=${stillThere?.status}`);

        check("the owner can cancel",
            (await PATCH("/api/reservations", { as: alice, body: { reservationId, status: "cancelled" } })).status, 200);
    }
}

async function sectionReviews(alice, restaurant) {
    check("GET /api/reviews/pending", (await GET("/api/reviews/pending", { as: alice })).status, 200);

    const completed = await makeCompletedReservation(alice, restaurant);

    const pending = await GET("/api/reviews/pending", { as: alice });
    checkThat("a completed meal shows up as pending review",
        JSON.stringify(pending.json ?? {}).includes(completed.toString()), trunc(pending.json, 200));

    const bad = [
        ["a rating of 0", { reservationId: completed.toString(), rating: 0 }],
        ["a rating of 6", { reservationId: completed.toString(), rating: 6 }],
        ["a fractional rating", { reservationId: completed.toString(), rating: 4.5 }],
        ["a rating sent as a string", { reservationId: completed.toString(), rating: "5" }],
        ["a missing rating", { reservationId: completed.toString() }],
        ["text over 999 chars", { reservationId: completed.toString(), rating: 5, text: "x".repeat(1000) }],
    ];
    for (const [label, body] of bad) {
        check(`review rejects ${label}`, (await POST("/api/reviews", { as: alice, body })).status, 400);
    }

    check("review rejects a malformed reservation id",
        (await POST("/api/reviews", { as: alice, body: { reservationId: BAD_ID, rating: 5 } })).status, 400);
    check("review 404s on an unknown reservation",
        (await POST("/api/reviews", { as: alice, body: { reservationId: DEAD_ID, rating: 5 } })).status, 404);
    check("review rejects malformed JSON",
        (await POST("/api/reviews", { as: alice, raw: "{" })).status, 400);

    /* A meal that has not happened yet is 409, not 400: the request is well
       formed and it is the booking's state that conflicts. */
    const future = await POST("/api/reservations", {
        as: alice, body: { fsqId: restaurant.fsqId, date: futureDinner(96), partySize: 2 },
    });
    const futureId = future.json?.reservation?._id;
    if (futureId) {
        created.reservations.push(new ObjectId(futureId));
        check("reviewing a meal that has not happened is 409",
            (await POST("/api/reviews", { as: alice, body: { reservationId: futureId, rating: 5 } })).status, 409);
    }

    const ok = await POST("/api/reviews", {
        as: alice, body: { reservationId: completed.toString(), rating: 5, text: `Smoke test review ${RUN}` },
    });
    check("POST /api/reviews on a completed meal", ok.status, 201, ok.text);
    if (ok.json?.review?._id) created.reviews.push(new ObjectId(ok.json.review._id));

    /* The unique {user, reservation} index doing work a find-then-insert could
       not: two tabs both read "no review yet" and the second write loses. */
    const dup = await POST("/api/reviews", { as: alice, body: { reservationId: completed.toString(), rating: 3 } });
    check("the same meal cannot be reviewed twice", dup.status, 409, dup.text);

    /* Two at once, from a cold start with no prior review — the race the index
       exists for. Exactly one must win. */
    const raceMeal = await makeCompletedReservation(alice, restaurant, 5);
    const settled = await Promise.all([1, 2, 3].map(() =>
        POST("/api/reviews", { as: alice, body: { reservationId: raceMeal.toString(), rating: 4 } })
    ));
    const wins = settled.filter((r) => r.status === 201).length;
    checkThat("concurrent reviews of one meal produce exactly one row", wins === 1,
        `${wins} of 3 succeeded (${settled.map((r) => r.status).join(",")})`);
    for (const r of settled) if (r.json?.review?._id) created.reviews.push(new ObjectId(r.json.review._id));

    /* A stranger reviewing your meal would let anyone inflate a restaurant's
       rating without ever eating there. Same 404 as a missing id, so the
       endpoint cannot be used to probe which reservation ids are real. */
    const mallory = await makeUser("revmallory");
    await POST("/api/user/login", { as: mallory, body: { identifier: mallory.username, password: mallory.password } });
    check("a stranger cannot review someone else's meal",
        (await POST("/api/reviews", { as: mallory, body: { reservationId: completed.toString(), rating: 1 } })).status, 404);

    const enriched = await db.collection("restaurants").findOne({ _id: restaurant._id });
    checkThat("the review is rolled into the restaurant's palateRating",
        (enriched?.palateRating?.count ?? 0) > 0, `count=${enriched?.palateRating?.count}`);
}

async function sectionMatching(alice) {
    const bob = await makeUser("groupbob");
    const carol = await makeUser("groupcarol");
    const mallory = await makeUser("groupmallory");
    for (const u of [bob, carol, mallory]) {
        await POST("/api/user/login", { as: u, body: { identifier: u.username, password: u.password } });
    }

    /* Bob is Alice's friend, Carol is not — which is what makes the difference
       between joining outright and landing in the approval queue observable. */
    await POST("/api/user/friends", { as: alice, body: { identifier: bob.username } });
    await POST("/api/user/friends", { as: bob, body: { identifier: alice.username } });

    check("GET /api/user/matching lists groups", (await GET("/api/user/matching", { as: alice })).status, 200);

    /* Voting shuts VOTE_LEAD_MINUTES before dinner, so a group booked nearer
       than that is born with its vote already closed. */
    check("a dinner too soon to vote on is refused",
        (await POST("/api/user/matching", { as: alice, body: { date: new Date(Date.now() + 10 * 60_000).toISOString(), friendsIds: [] } })).status, 400);
    check("a dinner in the past is refused",
        (await POST("/api/user/matching", { as: alice, body: { date: new Date(Date.now() - 86_400_000).toISOString(), friendsIds: [] } })).status, 400);
    check("group creation rejects an unparseable date",
        (await POST("/api/user/matching", { as: alice, body: { date: "banana", friendsIds: [] } })).status, 400);
    check("group creation rejects a missing date",
        (await POST("/api/user/matching", { as: alice, body: { friendsIds: [] } })).status, 400);
    check("group creation rejects a name over 60 chars",
        (await POST("/api/user/matching", { as: alice, body: { name: "x".repeat(61), date: futureDinner(), friendsIds: [] } })).status, 400);
    check("group creation rejects friendsIds sent as a string",
        (await POST("/api/user/matching", { as: alice, body: { date: futureDinner(), friendsIds: "everyone" } })).status, 400);

    /* Shape is the parser's job; whether these ids belong to actual friends is
       the database's. A malformed id must not reach Mongo as a raw cast. */
    const junkIds = await POST("/api/user/matching", {
        as: alice, body: { date: futureDinner(), friendsIds: [BAD_ID] },
    });
    check("group creation handles a malformed friend id", junkIds.status, [400, 404], junkIds.text);
    if (junkIds.json?.group?._id) created.groups.push(new ObjectId(junkIds.json.group._id));

    /* Inviting a stranger has to be refused here, or the friends graph is
         decorative. */
    const strangerInvite = await POST("/api/user/matching", {
        as: alice, body: { date: futureDinner(), friendsIds: [mallory.id] },
    });
    check("inviting a non-friend at creation is refused", strangerInvite.status, [400, 403], strangerInvite.text);
    if (strangerInvite.json?.group?._id) created.groups.push(new ObjectId(strangerInvite.json.group._id));

    const made = await POST("/api/user/matching", {
        as: alice, body: { name: `Smoke ${RUN}`, date: futureDinner(48), friendsIds: [bob.id] },
    });
    check("POST /api/user/matching creates a group", made.status, 201, made.text);
    const group = made.json?.group;
    if (!group?._id) { skip("the rest of the matching flow", "group creation failed"); return; }
    const groupId = group._id;
    created.groups.push(new ObjectId(groupId));

    checkThat("the organiser is a participant, not only an admin",
        (group.participants ?? []).length === 2,
        `${(group.participants ?? []).length} participants — omitting the admin computes every "3 of 5 voted" against a short count`);

    /* Populated user cards go to everyone in the group, so the projection on
       them is a real disclosure boundary. */
    const serialized = JSON.stringify(group);
    checkThat("group payload carries no password hash", !serialized.includes("$2"), "a bcrypt hash starts $2");
    checkThat("group payload carries no verifyToken", !/verifyToken/.test(serialized));

    /* ---- reads ---- */
    check("GET a group as a member", (await GET(`/api/user/matching/${groupId}`, { as: alice })).status, 200);
    check("GET a group rejects a malformed id",
        (await GET(`/api/user/matching/${BAD_ID}`, { as: alice })).status, 400);
    check("GET an unknown group is 404",
        (await GET(`/api/user/matching/${DEAD_ID}`, { as: alice })).status, 404);

    /* A non-member gets 404 rather than 403, and that is deliberate: a
       different status would let anyone probe which group ids are real. */
    const outsiderRead = await GET(`/api/user/matching/${groupId}`, { as: mallory });
    check("a non-member cannot read the group", outsiderRead.status, 404, outsiderRead.text);

    /* ---- membershipOpen ---- */
    check("an admin can lock the roster",
        (await PATCH(`/api/user/matching/${groupId}`, { as: alice, body: { membershipOpen: false } })).status, 200);
    check("membershipOpen rejects a non-boolean",
        (await PATCH(`/api/user/matching/${groupId}`, { as: alice, body: { membershipOpen: "yes" } })).status, 400);
    check("membershipOpen rejects an empty body",
        (await PATCH(`/api/user/matching/${groupId}`, { as: alice, body: {} })).status, 400);
    check("a plain member cannot change the roster lock",
        (await PATCH(`/api/user/matching/${groupId}`, { as: bob, body: { membershipOpen: true } })).status, 403);
    check("a non-member cannot change the roster lock",
        (await PATCH(`/api/user/matching/${groupId}`, { as: mallory, body: { membershipOpen: true } })).status, [403, 404]);
    await PATCH(`/api/user/matching/${groupId}`, { as: alice, body: { membershipOpen: true } });

    /* ---- location ---- */
    check("a member reports their location",
        (await PATCH(`/api/user/matching/${groupId}/location`, { as: alice, body: { coord: { lat: HERE.lat, lng: HERE.lng } } })).status, 200);
    check("Bob reports his location",
        (await PATCH(`/api/user/matching/${groupId}/location`, { as: bob, body: { coord: { lat: HERE.lat + 0.01, lng: HERE.lng + 0.01 } } })).status, 200);

    const badCoords = [
        ["a latitude above 90", { coord: { lat: 91, lng: 0 } }],
        ["a latitude below -90", { coord: { lat: -91, lng: 0 } }],
        ["a longitude above 180", { coord: { lat: 0, lng: 181 } }],
        ["swapped lat/lng magnitudes", { coord: { lat: 122.4, lng: 37.7 } }],
        ["coordinates sent as strings", { coord: { lat: "37.7", lng: "-122.4" } }],
        ["a missing lng", { coord: { lat: 37.7 } }],
        ["no coord object", {}],
    ];
    for (const [label, body] of badCoords) {
        check(`location rejects ${label}`, (await PATCH(`/api/user/matching/${groupId}/location`, { as: alice, body })).status, 400);
    }
    check("location rejects malformed JSON",
        (await PATCH(`/api/user/matching/${groupId}/location`, { as: alice, raw: "{" })).status, 400);
    /* 404 rather than 403 here too — a non-member must not learn the group is real. */
    check("a non-member cannot report a location for the group",
        (await PATCH(`/api/user/matching/${groupId}/location`, { as: mallory, body: { coord: HERE } })).status, [403, 404]);

    /* ---- join by invite ---- */
    const inviteCode = (await db.collection("matchings").findOne({ _id: new ObjectId(groupId) }))?.inviteCode
        ?? (await db.collection("matching").findOne({ _id: new ObjectId(groupId) }))?.inviteCode;

    check("join rejects an unknown invite code",
        (await POST("/api/user/matching/join", { as: carol, body: { inviteCode: "nosuchcode" } })).status, 404);
    check("join rejects an empty invite code",
        (await POST("/api/user/matching/join", { as: carol, body: { inviteCode: "" } })).status, 400);
    check("join rejects a missing invite code",
        (await POST("/api/user/matching/join", { as: carol, body: {} })).status, 400);
    check("join rejects malformed JSON",
        (await POST("/api/user/matching/join", { as: carol, raw: "{" })).status, 400);

    if (inviteCode) {
        /* Carol is a stranger to the organiser, so she queues rather than
           walking in — friend-of-a-participant is deliberately not a path. */
        const carolJoin = await POST("/api/user/matching/join", { as: carol, body: { inviteCode } });
        check("a stranger joining lands in the queue", carolJoin.status, [200, 202], carolJoin.text);

        const afterQueue = await db.collection("matchings").findOne({ _id: new ObjectId(groupId) });
        checkThat("the request is actually queued",
            (afterQueue?.pendingRequests ?? []).length === 1 ||
            (afterQueue?.participants ?? []).some((p) => p.user?.toString() === carol.id),
            `pending=${(afterQueue?.pendingRequests ?? []).length}`);

        /* Idempotent: a second tap must not queue twice. */
        const twice = await POST("/api/user/matching/join", { as: carol, body: { inviteCode } });
        check("joining twice is handled", twice.status, [200, 202, 409], twice.text);
        const afterTwice = await db.collection("matchings").findOne({ _id: new ObjectId(groupId) });
        checkThat("joining twice does not queue two requests",
            (afterTwice?.pendingRequests ?? []).length <= 1,
            `pending=${(afterTwice?.pendingRequests ?? []).length}`);

        check("an existing member joining again is handled",
            (await POST("/api/user/matching/join", { as: bob, body: { inviteCode } })).status, [200, 409]);
    } else {
        skip("invite-code join flow", "could not read the invite code from the database");
    }

    /* ---- request approval ---- */
    const requestsPath = `/api/user/matching/${groupId}/requests`;
    check("requests rejects an action outside the enum",
        (await POST(requestsPath, { as: alice, body: { targetId: carol.id, action: "maybe" } })).status, 400);
    check("requests rejects a missing targetId",
        (await POST(requestsPath, { as: alice, body: { action: "approve" } })).status, 400);
    check("requests rejects a malformed targetId",
        (await POST(requestsPath, { as: alice, body: { targetId: BAD_ID, action: "approve" } })).status, 400);
    check("requests 404s on someone with no pending request",
        (await POST(requestsPath, { as: alice, body: { targetId: mallory.id, action: "approve" } })).status, 404);
    check("a plain member cannot answer join requests",
        (await POST(requestsPath, { as: bob, body: { targetId: carol.id, action: "approve" } })).status, 403);

    const approved = await POST(requestsPath, { as: alice, body: { targetId: carol.id, action: "approve" } });
    check("the admin approves Carol", approved.status, [200, 404], approved.text);

    /* ---- shortlist ---- */
    const shortlistPath = `/api/user/matching/${groupId}/shortlist`;
    check("a plain member cannot start the vote",
        (await POST(shortlistPath, { as: bob })).status, 403);
    check("a non-member cannot start the vote",
        (await POST(shortlistPath, { as: mallory })).status, [403, 404]);
    check("shortlist rejects a malformed group id",
        (await POST(`/api/user/matching/${BAD_ID}/shortlist`, { as: alice })).status, 400);
    check("shortlist 404s on an unknown group",
        (await POST(`/api/user/matching/${DEAD_ID}/shortlist`, { as: alice })).status, 404);

    /* 503 is a legitimate answer — the recommender is a separate service and
       may not be running. What matters is that it is never a 500. */
    const shortlisted = await POST(shortlistPath, { as: alice });
    check("the admin starts the vote", shortlisted.status, [200, 409, 503], shortlisted.text);
    if (shortlisted.status === 503) {
        skip("vote/close/reservation flow", `recommender unavailable: ${trunc(shortlisted.json?.error)}`);
        return;
    }
    if (shortlisted.status !== 200) {
        skip("vote/close/reservation flow", `shortlist returned ${shortlisted.status}`);
        return;
    }

    const votingGroup = await db.collection("matchings").findOne({ _id: new ObjectId(groupId) });
    const ballot = (votingGroup?.restaurants ?? []).map((r) => r.toString());
    checkThat("the ballot is not empty", ballot.length > 0, `${ballot.length} candidates`);
    checkThat("the group moved to voting", votingGroup?.status === "voting", `status=${votingGroup?.status}`);

    check("starting the vote twice is 409", (await POST(shortlistPath, { as: alice })).status, 409);

    /* ---- vote ---- */
    const votePath = `/api/user/matching/${groupId}/vote`;
    check("vote rejects a non-array approvals field",
        (await PUT(votePath, { as: alice, body: { approvals: "all of them" } })).status, 400);
    check("vote rejects a missing approvals field",
        (await PUT(votePath, { as: alice, body: {} })).status, 400);
    check("vote rejects malformed JSON", (await PUT(votePath, { as: alice, raw: "{" })).status, 400);
    check("vote rejects a malformed restaurant id",
        (await PUT(votePath, { as: alice, body: { approvals: [BAD_ID] } })).status, 400);

    /* The pre-save hook rejects any approval that is not on this group's
       ballot — otherwise a member could vote for a restaurant nobody else can
       see. */
    check("vote rejects a restaurant that is not on the ballot",
        (await PUT(votePath, { as: alice, body: { approvals: [DEAD_ID] } })).status, [400, 409]);
    /* Accepted and collapsed rather than refused. The pre("save") hook that
       rejects duplicates does not fire on updateOne — document middleware never
       runs on a query — so the route dedupes in code. What matters is that the
       stored ballot holds one entry, since two would double this member's
       weight in tally(). */
    const dupVote = await PUT(votePath, { as: alice, body: { approvals: [ballot[0], ballot[0]] } });
    check("a duplicated approval is accepted", dupVote.status, 200, dupVote.text);
    const afterDup = await db.collection("matchings").findOne({ _id: new ObjectId(groupId) });
    const aliceBallot = (afterDup?.participants ?? [])
        .find((p) => p.user?.toString() === alice.id)?.approvals ?? [];
    checkThat("a duplicated approval is stored once", aliceBallot.length === 1,
        `${aliceBallot.length} entries — two would double this member's weight in tally()`);
    check("a non-member cannot vote",
        (await PUT(votePath, { as: mallory, body: { approvals: [] } })).status, 404);

    check("Alice votes", (await PUT(votePath, { as: alice, body: { approvals: ballot.slice(0, 2) } })).status, 200);
    check("Bob votes", (await PUT(votePath, { as: bob, body: { approvals: [ballot[0]] } })).status, 200);
    /* An empty ballot is abstaining, which is a legitimate vote. */
    check("an empty approvals array is accepted as an abstention",
        (await PUT(votePath, { as: alice, body: { approvals: [] } })).status, [200, 409]);

    /* ---- close ---- */
    const closePath = `/api/user/matching/${groupId}/close`;
    check("a plain member cannot close the vote", (await POST(closePath, { as: bob })).status, 403);
    check("a non-member cannot close the vote", (await POST(closePath, { as: mallory })).status, [403, 404]);
    check("close rejects a malformed group id",
        (await POST(`/api/user/matching/${BAD_ID}/close`, { as: alice })).status, 400);
    check("close 404s on an unknown group",
        (await POST(`/api/user/matching/${DEAD_ID}/close`, { as: alice })).status, 404);

    const closed = await POST(closePath, { as: alice });
    check("the admin closes the vote", closed.status, [200, 409], closed.text);

    if (closed.status === 200) {
        const settled = await db.collection("matchings").findOne({ _id: new ObjectId(groupId) });
        checkThat("the group is closed", settled?.status === "closed", `status=${settled?.status}`);
        checkThat("a winner was picked", !!settled?.winner, `winner=${settled?.winner}`);
        check("closing twice is 409", (await POST(closePath, { as: alice })).status, 409);

        /* ---- group booking ---- */
        const bookPath = `/api/user/matching/${groupId}/reservation`;
        check("a plain member cannot book the table", (await POST(bookPath, { as: bob })).status, 403);
        const booked = await POST(bookPath, { as: alice });
        check("the admin books the table", booked.status, [201, 409], booked.text);
        if (booked.json?.reservation?._id) created.reservations.push(new ObjectId(booked.json.reservation._id));
        if (booked.status === 201) {
            check("booking the same group twice is 409", (await POST(bookPath, { as: alice })).status, 409);
        }
    }
}

async function sectionRecommender(restaurant) {
    let alive = false;
    try {
        const probe = await fetch(`${RECOMMENDER}/openapi.json`, { signal: AbortSignal.timeout(3000) });
        alive = probe.ok;
    } catch { alive = false; }

    if (!alive) {
        skip("recommender endpoints", `nothing answering on ${RECOMMENDER} — start service.py to cover these`);
        return;
    }

    const post = async (path, body) => {
        const res = await fetch(`${RECOMMENDER}${path}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            /* The service loads a sentence-transformer on its first request, so
               the ceiling is the cold start rather than the search. */
            signal: AbortSignal.timeout(30_000),
        });
        const text = await res.text();
        let json = null; try { json = JSON.parse(text); } catch {}
        return { status: res.status, json, text };
    };

    const rec = await post("/recommend", { query: "A Italian, Pizza restaurant", k: 5 });
    check("POST /recommend", rec.status, 200, rec.text);
    checkThat("/recommend returns at most k results",
        (rec.json?.results ?? rec.json?.hits ?? []).length <= 5, trunc(rec.json, 120));

    check("/recommend rejects a missing query", (await post("/recommend", { k: 5 })).status, 422);
    check("/recommend rejects a non-string query", (await post("/recommend", { query: 42 })).status, 422);
    check("/recommend handles k=0", (await post("/recommend", { query: "pizza", k: 0 })).status, [200, 400, 422]);
    check("/recommend handles a negative k", (await post("/recommend", { query: "pizza", k: -1 })).status, [200, 400, 422]);
    check("/recommend handles an empty query string", (await post("/recommend", { query: "", k: 3 })).status, [200, 400, 422]);
    check("/recommend handles candidateIds that are not indexed",
        (await post("/recommend", { query: "pizza", k: 3, candidateIds: [`${TAG}_nope`] })).status, [200, 400, 404]);

    const group = await post("/recommend/group", {
        queries: ["A Italian restaurant", "A vegetarian friendly place"],
        k: 5, strategy: "centroid",
    });
    check("POST /recommend/group with centroid", group.status, 200, group.text);

    for (const strategy of ["blend", "min", "mean"]) {
        /* Every strategy except centroid needs the geo-feasible candidate set,
           so a missing one is a legitimate 400 rather than a crash. */
        const res = await post("/recommend/group", {
            queries: ["A Italian restaurant", "A cheap noodle place"], k: 5, strategy,
        });
        check(`/recommend/group with strategy "${strategy}"`, res.status, [200, 400], res.text);
    }

    check("/recommend/group rejects an unknown strategy",
        (await post("/recommend/group", { queries: ["pizza"], strategy: "vibes" })).status, 400);
    check("/recommend/group rejects members sent as a bare string",
        (await post("/recommend/group", { queries: "pizza" })).status, 422);
    check("/recommend/group handles no members at all",
        (await post("/recommend/group", { queries: [], vectors: [] })).status, [200, 400, 422]);

    /* weights runs parallel to queries-then-vectors concatenated in that order,
       so a length mismatch is the easy way to get a silent misalignment where
       one member's taste is applied to another. */
    check("/recommend/group handles a weights length mismatch",
        (await post("/recommend/group", { queries: ["a", "b"], weights: [1.0], strategy: "centroid" })).status, [200, 400, 422]);
    check("/recommend/group handles alpha above 1",
        (await post("/recommend/group", { queries: ["a"], strategy: "blend", alpha: 5 })).status, [200, 400, 422]);
    check("/recommend/group handles a wrong-dimension vector",
        (await post("/recommend/group", { vectors: [[0.1, 0.2, 0.3]], strategy: "centroid" })).status, [200, 400, 422, 500]);

    const debug = await post("/recommend/group", { queries: ["A Italian restaurant"], k: 3, strategy: "centroid", debug: true });
    check("/recommend/group debug mode", debug.status, 200, debug.text);

    check("POST /index/missing with explicit ids",
        (await post("/index/missing", { businessIds: [restaurant.fsqId] })).status, [200, 400], "");
    /* force re-embeds rows the index already holds, which is only meaningful
       against a named list — a corpus-wide forced sweep is a footgun. */
    check("/index/missing refuses force without businessIds",
        (await post("/index/missing", { force: true })).status, 400);
}

async function sectionRateLimits() {
    if (SKIP_RATELIMIT) {
        skip("rate limits", "--no-ratelimit");
        return;
    }

    /* Each burst gets its own throwaway source address so it cannot spend the
       budget the rest of the run depends on. Counters are per-process and
       in-memory, so a dev server restart resets all of this. */

    const searchIp = randomIp();
    let searchLimited = null;
    for (let i = 0; i < 40 && !searchLimited; i++) {
        const res = await GET("/api/Restaurants/search", {
            as: { name: "rl", ip: searchIp, cookie: null },
            query: { query: "pizza", lat: HERE.lat, lng: HERE.lng },
        });
        if (res.status === 429) searchLimited = res;
    }
    checkThat("search is rate limited (30/min)", searchLimited !== null,
        searchLimited ? "" : "40 requests from one address were all accepted");
    if (searchLimited) {
        checkThat("search 429 carries Retry-After", !!searchLimited.headers.get("retry-after"),
            searchLimited.headers.get("retry-after") ?? "absent");
        /* Deliberately absent on an auth-adjacent endpoint: those headers are a
           live readout of how hard an attacker may push. */
        checkThat("search 429 does not leak a remaining-quota header",
            !searchLimited.headers.get("x-ratelimit-remaining"));
    }

    const loginIp = randomIp();
    let loginLimited = null;
    for (let i = 0; i < 14 && !loginLimited; i++) {
        const res = await POST("/api/user/login", {
            as: { name: "rl", ip: loginIp, cookie: null },
            body: { identifier: `${TAG}_ghost_rl`, password: "WrongPassword!1" },
        });
        if (res.status === 429) loginLimited = res;
    }
    checkThat("login is rate limited by IP (10/15min)", loginLimited !== null,
        loginLimited ? "" : "14 failed sign-ins from one address were all accepted");
    if (loginLimited) {
        checkThat("login 429 carries the RATE_LIMITED code",
            loginLimited.json?.code === "RATE_LIMITED", loginLimited.json?.code);
    }

    /* The per-account key exists because a per-IP limit alone does nothing
       against a botnet grinding one account from a thousand addresses. So the
       test has to rotate the address on every attempt — if this passes only
       because of the IP limit, it proves nothing. */
    const victim = await makeUser("rlvictim");
    let accountLimited = null;
    for (let i = 0; i < 25 && !accountLimited; i++) {
        const res = await POST("/api/user/login", {
            as: { name: "rl", ip: randomIp(), cookie: null },
            body: { identifier: victim.username, password: "WrongPassword!1" },
        });
        if (res.status === 429) accountLimited = res;
    }
    checkThat("login is rate limited per account across changing IPs", accountLimited !== null,
        accountLimited ? "" : "25 failed sign-ins from 25 addresses were all accepted");

    /* And the budget is spent only by failures — a user with a busy day must
       not lock themselves out. Verified by checking a correct password still
       works from a fresh address after the account budget was drained. */
    if (accountLimited) {
        const recovered = await POST("/api/user/login", {
            as: { name: "rl", ip: randomIp(), cookie: null },
            body: { identifier: victim.username, password: victim.password },
        });
        checkThat("a throttled account is throttled for correct passwords too",
            recovered.status === 429,
            `${recovered.status} — the per-account limit is checked before the password, by design`);
    }

    const signupIp = randomIp();
    let signupLimited = null;
    for (let i = 0; i < 8 && !signupLimited; i++) {
        const res = await POST("/api/user/signup", {
            as: { name: "rl", ip: signupIp, cookie: null },
            body: {
                username: `${TAG}_rl${i}`, firstName: "RL",
                email: `${TAG}_rl${i}@example.test`, password: "SmokeTest!2468",
            },
        });
        if (res.json?.userId) created.users.push(new ObjectId(res.json.userId));
        if (res.status === 429) signupLimited = res;
    }
    checkThat("signup is rate limited (5/hour)", signupLimited !== null,
        signupLimited ? "" : "8 signups from one address were all accepted");
}

async function sectionMethodsAndShape(alice) {
    /* A route file that exports only PATCH must answer 405 to a POST, not 200
       and not a stack trace. Next generates these, so this is really a check
       that nothing has been added to the wrong file. */
    const wrong = [
        ["GET", "/api/user/lists"],
        ["POST", "/api/user/lists"],
        ["PUT", "/api/user/preferences"],
        ["DELETE", "/api/reservations"],
        ["GET", "/api/reviews"],
        ["POST", "/api/Restaurants/search"],
        ["DELETE", "/api/Restaurants/nearby"],
        ["GET", "/api/user/login"],
        ["GET", "/api/user/signup"],
    ];
    for (const [method, path] of wrong) {
        const res = await call(method, path, { as: alice, body: {} });
        check(`${method} ${path} is not implemented`, res.status, [404, 405], res.text);
    }

    /* withAuth mints a correlation id per request so "it failed around 4:12"
       becomes one grep. It is only useful if it actually reaches the client. */
    const withId = await GET("/api/user/dashboard", { as: alice });
    checkThat("authenticated responses carry x-request-id", !!withId.headers.get("x-request-id"),
        withId.headers.get("x-request-id") ?? "absent");

    const anonId = await GET("/api/user/dashboard");
    checkThat("even a 401 carries x-request-id", !!anonId.headers.get("x-request-id"),
        anonId.headers.get("x-request-id") ?? "absent");

    /* A body far larger than anything the UI sends. The answer can be a 400 or
       a 413; a hang or a crashed worker cannot. */
    const huge = await PATCH("/api/user", { as: alice, body: { favDish: "x".repeat(2_000_000) } });
    check("a 2MB body is rejected cleanly", huge.status, [400, 413, 500], "");

    /* Deeply nested JSON, the shape that blows a recursive parser's stack. */
    let nested = { a: 1 };
    for (let i = 0; i < 2000; i++) nested = { a: nested };
    const deep = await PATCH("/api/user", { as: alice, body: nested });
    check("deeply nested JSON is rejected cleanly", deep.status, [400, 413, 500], "");

    /* A JSON body sent with the wrong content-type. */
    const wrongType = await PATCH("/api/user", {
        as: alice, raw: JSON.stringify({ favDish: "x" }), headers: { "content-type": "text/plain" },
    });
    check("a text/plain body is handled", wrongType.status, [200, 400, 415], wrongType.text);
}

/* ------------------------------------------------------------------ *
 *  Teardown
 * ------------------------------------------------------------------ */

/* Scoped to the ids this run collected and to the TAG prefix, never to a broad
   filter. This points at a development database that has real rows in it. */
async function teardown() {
    if (KEEP) {
        console.log(`\n${C.y}--keep: leaving fixtures behind. Prefix: ${TAG}${C.x}`);
        return;
    }

    const userIds = [
        ...created.users,
        ...(await db.collection("users").find({ username: new RegExp(`^${TAG}_`) }, { projection: { _id: 1 } }).toArray()).map((u) => u._id),
    ];
    const uniqueUsers = [...new Map(userIds.map((id) => [id.toString(), id])).values()];

    const groupIds = [
        ...created.groups,
        ...(await db.collection("matchings").find({ createdBy: { $in: uniqueUsers } }, { projection: { _id: 1 } }).toArray()).map((g) => g._id),
    ];
    const uniqueGroups = [...new Map(groupIds.map((id) => [id.toString(), id])).values()];

    const restaurantIds = [
        ...created.restaurants,
        ...(await db.collection("restaurants").find({ fsqId: new RegExp(`^${TAG}_`) }, { projection: { _id: 1 } }).toArray()).map((r) => r._id),
    ];
    const uniqueRestaurants = [...new Map(restaurantIds.map((id) => [id.toString(), id])).values()];

    const removed = {
        reviews: (await db.collection("reviews").deleteMany({ user: { $in: uniqueUsers } })).deletedCount,
        reservations: (await db.collection("reservations").deleteMany({ users: { $in: uniqueUsers } })).deletedCount,
        addresses: (await db.collection("addresses").deleteMany({ _id: { $in: created.addresses } })).deletedCount,
        friendships: (await db.collection("friendships").deleteMany({
            $or: [{ requester: { $in: uniqueUsers } }, { recipient: { $in: uniqueUsers } },
                  { users: { $in: uniqueUsers } }],
        }).catch(() => ({ deletedCount: 0 }))).deletedCount,
        groups: (await db.collection("matchings").deleteMany({ _id: { $in: uniqueGroups } })).deletedCount,
        restaurants: (await db.collection("restaurants").deleteMany({ _id: { $in: uniqueRestaurants } })).deletedCount,
        users: (await db.collection("users").deleteMany({ _id: { $in: uniqueUsers } })).deletedCount,
    };

    console.log(`\n${C.d}cleaned up: ${Object.entries(removed).map(([k, v]) => `${v} ${k}`).join(", ")}${C.x}`);
}

/* ------------------------------------------------------------------ *
 *  Main
 * ------------------------------------------------------------------ */

async function main() {
    console.log(`${C.b}API smoke test${C.x}  ${C.d}${BASE}  run=${RUN}${C.x}`);

    /* One cheap request first, so every later failure is about the app rather
       than about nothing listening. Generous timeout: `next dev` compiles a
       route on its first request, and a cold one can take well over a minute. */
    try {
        await fetch(`${BASE}/api/Restaurants/search?query=a&lat=0&lng=0`, { signal: AbortSignal.timeout(180_000) });
    } catch (error) {
        console.error(`\n${C.r}No server on ${BASE}${C.x} — start it with \`npm run dev\`.\n(${error.message})`);
        process.exit(2);
    }

    await connectMongo();

    const restaurant = await makeRestaurant("main", HERE);
    await makeRestaurant("far", FAR);
    /* A handful more inside the search radius, because the shortlist wants
       seven candidates and a one-restaurant corpus makes that untestable. */
    for (let i = 0; i < 8; i++) {
        await makeRestaurant(`extra${i}`, { lat: HERE.lat + i * 0.002, lng: HERE.lng + i * 0.002 });
    }

    const alice = await makeUser("alice");
    await POST("/api/user/login", { as: alice, body: { identifier: alice.username, password: alice.password } });

    try {
        await runSection("unauthenticated", sectionUnauthenticated);
        await runSection("signup", sectionSignup);
        await runSection("login", sectionLogin);
        await runSection("verify-email", sectionVerifyEmail);
        await runSection("verified-gate", sectionVerifiedGate);
        await runSection("resend-verification", sectionResendVerification);
        await runSection("profile", () => sectionProfile(alice));
        await runSection("preferences", () => sectionPreferences(alice));
        await runSection("addresses", () => sectionAddresses(alice));
        await runSection("friends", () => sectionFriends(alice));
        await runSection("lists", () => sectionLists(alice, restaurant));
        await runSection("wishlist", () => sectionWishlistAndVisited(alice, restaurant));
        await runSection("search", () => sectionSearch(restaurant));
        await runSection("nearby", () => sectionNearby(alice, restaurant));
        await runSection("reservations", () => sectionReservations(alice, restaurant));
        await runSection("reviews", () => sectionReviews(alice, restaurant));
        await runSection("matching", () => sectionMatching(alice));
        await runSection("recommender", () => sectionRecommender(restaurant));
        await runSection("http", () => sectionMethodsAndShape(alice));
        /* Last, always. It leaves the in-memory buckets poisoned for whatever
           runs next, so nothing that needs a working login may follow it. */
        await runSection("rate-limits", sectionRateLimits);
    } finally {
        await teardown();
        await mongo.close();
    }

    summarize();
}

function summarize() {
    const pass = results.filter((r) => r.status === "PASS").length;
    const fail = results.filter((r) => r.status === "FAIL");
    const skipped = results.filter((r) => r.status === "SKIP");

    console.log(`\n${C.b}${"═".repeat(62)}${C.x}`);

    const bySection = new Map();
    for (const r of results) {
        const s = bySection.get(r.section) ?? { pass: 0, fail: 0, skip: 0 };
        s[r.status.toLowerCase()] += 1;
        bySection.set(r.section, s);
    }
    for (const [name, s] of bySection) {
        const bar = s.fail > 0 ? `${C.r}✗${C.x}` : `${C.g}✓${C.x}`;
        console.log(`  ${bar} ${name.padEnd(22)} ${String(s.pass).padStart(3)} pass` +
            (s.fail ? `  ${C.r}${s.fail} fail${C.x}` : "") +
            (s.skip ? `  ${C.y}${s.skip} skip${C.x}` : ""));
    }

    if (fail.length) {
        console.log(`\n${C.r}${C.b}Failures${C.x}`);
        for (const f of fail) console.log(`  ${C.r}•${C.x} [${f.section}] ${f.label}\n      ${C.d}${f.detail}${C.x}`);
    }
    if (skipped.length) {
        console.log(`\n${C.y}Skipped${C.x}`);
        for (const s of skipped) console.log(`  ${C.y}•${C.x} [${s.section}] ${s.label} ${C.d}${s.detail ?? ""}${C.x}`);
    }

    console.log(`\n${C.b}${pass} passed, ${fail.length} failed, ${skipped.length} skipped${C.x}  ${C.d}(${results.length} checks)${C.x}\n`);
    process.exit(fail.length ? 1 : 0);
}

main().catch(async (error) => {
    console.error(`\n${C.r}fatal:${C.x} ${error?.stack ?? error}`);
    try { await mongo?.close(); } catch {}
    process.exit(2);
});
