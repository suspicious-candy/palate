/* The recommender's address and credentials, in one place.

   Four call sites reached for `process.env.RECOMMENDER_URL ?? "http://localhost:8000"`
   independently — nearby (twice), the group shortlist, and the re-embed after a
   review. That was survivable while the service was unauthenticated. It stops
   being survivable the moment there is a token to send, because a caller that
   forgets it does not fail loudly: /index/missing answers 401, the .catch()
   logs a line nobody reads, and the vectors just quietly stop being written.

   So the token lives here and the write call is a function rather than a URL. */

export const RECOMMENDER_URL =
    process.env.RECOMMENDER_URL ?? "http://localhost:8000";

/* Only the write endpoint checks this. The read endpoints (/recommend,
   /recommend/group) are deliberately open — they are cheap, they expose nothing
   a visitor cannot already see in the app, and the Next server calls them on
   behalf of signed-out users. Sending the header on every call anyway would be
   harmless but would blur which endpoints are actually protected. */
function writeHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = process.env.RECOMMENDER_TOKEN;
    if (token) headers["x-recommender-token"] = token;
    return headers;
}

/**
 * Ask the recommender to embed rows Mongo has and Chroma does not.
 *
 * FIRE AND FORGET, deliberately, and that is why this returns void rather than
 * a promise the caller might await. Both call sites are on a path where a user
 * is waiting: nearby has just synced an area and wants to answer now, and the
 * review enrichment runs after a modal has already closed. A vector that is a
 * second stale is invisible to both; a round trip they waited on would not be.
 *
 * The failure is logged rather than thrown for the same reason. Nothing later
 * in either request depends on this, and an unhandled rejection would take down
 * a request that has already succeeded.
 *
 * @param businessIds fsqIds to index.
 * @param force re-embed rows already in the index, for when the TEXT changed
 *   rather than the row being new — a review landing in tips[] is the case.
 *   The service rejects force without ids, so it is never sent alone.
 */
export function indexMissing(businessIds: string[], { force = false } = {}): void {
    if (businessIds.length === 0) return;

    fetch(`${RECOMMENDER_URL}/index/missing`, {
        method: "POST",
        headers: writeHeaders(),
        body: JSON.stringify({ businessIds, force }),
    })
        .then((res) => {
            /* A 401 here is a configuration mistake, not a transient failure,
               and it is invisible without this: fetch does not reject on a 4xx,
               so the old .catch()-only shape treated "your token is wrong" as
               success and silently stopped indexing. */
            if (!res.ok) {
                console.error(
                    `[recommender] /index/missing responded ${res.status}` +
                    (res.status === 401
                        ? " — RECOMMENDER_TOKEN is missing or does not match the service's"
                        : "")
                );
            }
        })
        .catch((err) => console.error("[recommender] /index/missing unreachable:", err));
}
