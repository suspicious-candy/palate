/* `import type`, not a plain import. userContext is a "use client" module, and
   the keyword guarantees this is erased at compile time rather than left to the
   bundler to decide. This file imports a Mongoose model, so it must never end
   up reachable from browser code. Imports point one way here: from this impure
   module toward pure groupVote, never back. */
import type { matching } from "@/lib/userContext";
import { leader, votingDeadlinePassed } from "@/lib/groupVote";
import matchingModel from "@/models/matching.js";

/** Why the vote did or did not end.
 *
 * Three values rather than a boolean, because "did not close" has two meanings
 * callers treat differently: a page load shrugs at both, while the admin route
 * must report `already-closed` to the human who asked and can never see
 * `not-due` at all. */
export type CloseResult = "closed" | "already-closed" | "not-due";

/**
 * Ends a group's vote and records who won.
 *
 * @param group MUST be populated — findGroupById, not findById().lean().
 *   tally() keys restaurants by `fsqId`, which a bare ObjectId reference does
 *   not have, so a raw document counts nothing, leader() returns null, and the
 *   group closes with no winner. That outcome is indistinguishable from a
 *   legitimate nobody-voted group: no error, just every vote silently producing
 *   no result.
 * @param force skip the deadline check, for an admin closing early. Page loads
 *   pass nothing.
 */
export async function closeVote(
    group: matching,
    { force = false }: { force?: boolean } = {}
): Promise<CloseResult> {
    if (group?.status !== "voting") {
        return "already-closed";
    }

    /* What makes this safe to call on every read: almost every call stops here
       having touched nothing. */
    if (!force && !votingDeadlinePassed(group)) {
        return "not-due";
    }

    /* null when nobody voted, since leader() requires votes > 0, and null is
       exactly what gets stored. The vote ran and produced nothing, which is the
       honest record. Substituting the recommender's top pick would show the
       group a restaurant as "what you chose" that nobody chose, with nothing
       afterwards to reveal the difference. */
    const top = leader(group);
    const winner = top?.restaurant._id ?? null;

    /* Compare-and-set: `status: "voting"` lives in the filter, so the database
       checks it and writes as one indivisible operation. Two page loads racing
       to close the same group cannot both win.

       Both fields go in one update. Split them and a read landing in between
       sees a closed group with no winner, indistinguishable from nobody having
       voted. One update, one visible transition.

       No try/catch: a Mongo failure here is a real error and belongs to the
       route's handler, which turns it into a 500. Catching it to rethrow adds
       nothing and loses the original. */
    const updated = await matchingModel.updateOne(
        { _id: group._id, status: "voting" },
        { $set: { status: "closed", winner } }
    );

    /* Zero matched means another request closed it between the check at the top
       of this function and this write — the exact case the filter clause exists
       to catch. */
    return updated.matchedCount === 0 ? "already-closed" : "closed";
}
