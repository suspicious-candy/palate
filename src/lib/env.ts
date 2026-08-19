/* A startup check for the variables that fail QUIETLY when unset.

   The deployment checklist for this app is four environment variables long, and
   every one of them has the same nasty property: forget it and the app still
   boots, still serves pages, and still looks correct. The damage shows up later
   and somewhere else.

     RECOMMENDER_URL        falls back to http://localhost:8000. On a host,
                            nothing answers there — so /nearby silently serves an
                            unranked list (it catches and shrugs) while the group
                            shortlist returns 503. Two different symptoms, neither
                            of which says "config".
     RECOMMENDER_TOKEN      the recommender answers 401 to indexing. fetch does
                            not reject on 4xx, so new restaurants simply never
                            get vectors.
     UPSTASH_REDIS_REST_*   the rate limiter falls back to a per-process Map. On
                            serverless that is approximately no rate limiting at
                            all, and nothing in the logs says so.
     APP_URL                verification and reservation emails build absolute
                            links from it. Unset, every link in outgoing mail
                            points at localhost.

   So this logs once, loudly, at startup. It deliberately does NOT throw: a
   missing recommender URL should degrade the app, not refuse to boot it, and an
   app that will not start is a worse outage than one running without a cache.
   The exception is TOKEN_SECRET, which withAuth already treats as fatal per
   request — a server that cannot verify a session is broken rather than
   degraded, and that check stays where it is.

   Imported for its side effect by instrumentation.ts, which Next runs once per
   server process before handling any request. */

type Check = { name: string; consequence: string };

const REQUIRED_IN_PRODUCTION: Check[] = [
    { name: "mongo_url", consequence: "every request that touches the database will fail" },
    { name: "TOKEN_SECRET", consequence: "every authenticated route will answer 500" },
    { name: "APP_URL", consequence: "links in verification and reservation emails will point at localhost" },
    { name: "RECOMMENDER_URL", consequence: "recommendations degrade silently and group shortlists 503" },
    { name: "RECOMMENDER_TOKEN", consequence: "indexing new restaurants will 401 and be dropped" },
    { name: "UPSTASH_REDIS_REST_URL", consequence: "rate limits become per-instance, which on serverless is none" },
    { name: "UPSTASH_REDIS_REST_TOKEN", consequence: "rate limits become per-instance, which on serverless is none" },
    { name: "SMTP_HOST", consequence: "no email is sent; signup still succeeds but nobody can verify" },
    { name: "MAIL_FROM", consequence: "no email is sent; signup still succeeds but nobody can verify" },
];

export function checkEnvironment(): void {
    /* Development is expected to be missing most of these — the fallbacks exist
       precisely so a laptop needs no configuration. Warning there would train
       everyone to ignore the warning. */
    if (process.env.NODE_ENV !== "production") return;

    const missing = REQUIRED_IN_PRODUCTION.filter(
        (check) => !process.env[check.name]?.trim()
    );

    if (missing.length === 0) return;

    console.warn(
        `\n[env] ${missing.length} environment variable(s) are not set in production:\n` +
        missing.map((m) => `      ${m.name.padEnd(26)} ${m.consequence}`).join("\n") +
        `\n      See .env.example. The app will run; these fail quietly, which is why this exists.\n`
    );
}
