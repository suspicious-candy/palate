/* Pure: no database, no model import. Everything it needs arrives as an
   argument, which is what lets the route decide the ORDER of its lookups —
   most of the outcomes below are reachable without ever asking the friendship
   collection anything. Imports point one way, toward pure groupVote. */
import type { matching } from "@/lib/userContext";
import { groupIsStale } from "@/lib/groupVote";

/** Ceiling on the queue. An invite link that escapes into a group chat can be
    followed by anyone who sees it, and `pendingRequests` is an embedded array
    on the group document — unbounded growth is a real shape here, not a
    theoretical one. Well below any Mongo document limit: the number that
    matters is how many approval cards a human will actually read. */
export const PENDING_LIMIT = 50;

/** Why someone did or did not get into a group.
 *
 * Tags, not sentences. The route maps these to HTTP statuses and the UI maps
 * them to copy, so a wording change stays a wording change — see FriendOutcome
 * in lib/friends.ts, which exists for the same reason. Three of these are
 * plain successes ("already_participant", "already_pending", "admitted"), one
 * is a success that reads like a refusal ("queued"), and the rest are refusals
 * with genuinely different remedies. */
export type AdmissionOutcome =
    | "group_not_found"
    | "already_participant"
    | "already_pending"
    | "group_closed"
    | "dinner_passed"
    | "roster_locked"
    | "queue_full"
    | "admitted"
    | "queued";

/* Legacy-document guards, and the reason they are needed is written on
   membershipOpen in models/matching.js: Mongoose applies defaults at CREATION
   only. Every group that existed before these fields were added has no value
   for them, so .lean() hands back undefined.

   For pendingRequests that means .some() on undefined, which throws. For
   membershipOpen it is quieter and worse: `!undefined` is true, so every
   pre-existing group would read as LOCKED — the exact inversion that comment
   predicted. Hence the explicit `=== false` rather than a bare negation. */
function pendingOf(group: matching): matching["pendingRequests"] {
    return group.pendingRequests ?? [];
}

function rosterLocked(group: matching): boolean {
    return group.membershipOpen === false;
}

/**
 * Decide what happens when `userId` tries to join `group`.
 *
 * @param isFriendOfAdmin whether this user is an accepted friend of at least
 *   one current admin — the caller's job, via areFriendsWithAny. Passed in
 *   rather than looked up so the query can be skipped entirely for the many
 *   outcomes that do not depend on it.
 *
 * ORDER IS THE DESIGN HERE. The two "already in" checks run before every state
 * gate, because a member who follows the link again — lost tab, forwarded
 * message, the only URL they kept — must land in their group rather than be
 * told they cannot join a dinner they are already going to.
 */
export function admissionVerdict(
    userId: string,
    group: matching | null,
    isFriendOfAdmin: boolean
): AdmissionOutcome {
    if (!group) return "group_not_found";

    /* .toString() on both sides. These ids are typed as strings by
       FriendSummary, but .lean() leaves real ObjectId instances in place — the
       declared type is a claim the runtime does not honour, so comparing them
       raw makes every check silently fail. */
    if (group.participants.some((p) => p.user?._id?.toString() === userId)) {
        return "already_participant";
    }
    if (pendingOf(group).some((r) => r.user?._id?.toString() === userId)) {
        return "already_pending";
    }

    /* Two refusals rather than one, because the honest answer differs. A closed
       group picked a winner; a stale group's dinner simply happened — possibly
       while still sitting at status "voting", because nobody ever opened it. */
    if (group.status === "closed") return "group_closed";
    if (groupIsStale(group)) return "dinner_passed";

    /* Orthogonal to status on purpose: the organiser can freeze the guest list
       while the vote is still open. A separate outcome from the two above
       because it points the joiner at a different action — ask, rather than
       give up. */
    if (rosterLocked(group)) return "roster_locked";

    if (pendingOf(group).length >= PENDING_LIMIT) return "queue_full";

    /* The link got them to the door; the friendship graph decides whether it
       opens. A stranger who found a forwarded URL lands in the queue, which is
       the whole reason a leaked link is not a leaked group. */
    return isFriendOfAdmin ? "admitted" : "queued";
}
