import matchingModel from "@/models/matching.js";
/* Side-effect imports, not dead code. Mongoose resolves `ref: "restaurants"` by
   looking the model up by name in its registry, so a module that never imports
   these makes populate() throw MissingSchemaError. Needed here because the
   populate chain below follows refs into both collections. */
import "@/models/restaurantModel.js";
import "@/models/userModel.js";
import type { matching, GroupSummary } from "@/lib/userContext";
/* Imports point one way: this impure module reaches into pure groupVote, never
   the reverse. STALE_AFTER_HOURS lives there so groupAdmission can share it
   without pulling a Mongoose model into a pure decision function. */
import { STALE_AFTER_HOURS } from "@/lib/groupVote";

/* Group membership is read by querying the matching collection directly.

   There is no pointer on the user document, by design. A denormalized
   `user.matchingGroup` would have to be written alongside every membership
   change — two documents per write, in a database where transactions need a
   replica set — and the two can drift. Querying `participants.user` makes
   `participants[]` the single source of truth, so creating a group is one
   insert and adding someone is one $push. Nothing can disagree with anything.

   The cost is an index, added in matching.js. */

/** The four fields FriendSummary declares.

    A populated subdocument does not inherit the outer query's .select(), so
    without this every participant's password hash, email and phone would ship
    to the browser alongside their avatar initials. */
export const USER_SUMMARY = "username firstName lastName profilePic";

/* One chain, used by every lookup that returns a full group.

   The `matching` return type is a claim, not a guarantee: it holds only while
   this covers every ref the type declares as an object. Widening the type
   without widening this makes it start lying, silently — which is why the
   finders share one chain rather than each spelling out their own. */
const GROUP_POPULATE = [
    { path: "participants.user", select: USER_SUMMARY },
    { path: "participants.approvals" },
    { path: "restaurants" },
    { path: "winner" },
    { path: "admins", select: USER_SUMMARY },
    /* Same projection as every other user ref, for the same reason: an admin
       reviewing the queue is shown a stranger's card, and without an explicit
       select that card would carry the stranger's password hash and email to
       the browser alongside their avatar. */
    { path: "pendingRequests.user", select: USER_SUMMARY },
    { path: "reservation" },
];

/* The list's chain, kept short on purpose — see GroupSummary in userContext for
   what the rows actually read. Two paths are absent deliberately:
   `participants.approvals`, because no row shows a ballot, and `restaurants`,
   because a row shows the shortlist's length and ids count perfectly well.
   `admins` stays unpopulated for the same reason: the page only asks whether
   the viewer's id is in it.

   Anything needing more than this must go through findGroupById. A group loaded
   here cannot be passed to tally(), leader() or closeVote(): those key
   restaurants by fsqId, a bare ObjectId has none, and the failure is silent —
   every vote counts zero and the group closes with no winner. */
const GROUP_SUMMARY_POPULATE = [
    { path: "participants.user", select: USER_SUMMARY },
    { path: "winner", select: "name" },
];

/* A hard ceiling, not a page size. Someone who has organised dinners weekly for
   a year has around 50 groups and every one of them is real, but an unbounded
   populate is a query whose cost is set by the user's history. Sorted newest
   first so the cut falls on the oldest, which is also the least interesting.
   Revisit as pagination if anyone reaches it. */
const MAX_GROUPS = 100;

/**
 * Every group this user is a participant in, newest dinner first.
 *
 * Applies no staleness filter. Splitting live dinners from finished ones is the
 * caller's job, because the list wants the old ones too under a "Past" heading.
 * Use groupIsStale to divide them, so there is one definition of "still a live
 * dinner" rather than two.
 */
export async function findUserGroups(userId: string): Promise<GroupSummary[]> {
    return matchingModel
        .find({ "participants.user": userId })
        .sort({ date: -1 })
        .limit(MAX_GROUPS)
        .populate(GROUP_SUMMARY_POPULATE)
        .lean<GroupSummary[]>();
}

/**
 * One group by id, populated identically to findActiveGroup.
 *
 * Callers that have just written a group need this rather than findActiveGroup:
 * a user can be in several groups, so "the soonest" is not necessarily the one
 * they just touched.
 */
export async function findGroupById(groupId: string): Promise<matching | null> {
    return matchingModel
        .findById(groupId)
        .populate(GROUP_POPULATE)
        .lean<matching | null>();
}
export async function findGroupByInviteCode (inviteCode: string): Promise<matching | null> {
    return matchingModel
        .findOne({inviteCode:inviteCode})
        .populate(GROUP_POPULATE)
        .lean<matching | null>();
}
/**
 * The single most imminent group for this user, or null.
 *
 * "Current" means the soonest dinner that has not gone stale. A user can be in
 * several groups at once — a work lunch and a Friday dinner do not conflict —
 * so this picks the most imminent rather than pretending only one can exist.
 * The dashboard's one-line summary is the remaining caller; the groups tab uses
 * findUserGroups above.
 *
 * The `matching` return type is a claim, not a guarantee: it holds only while
 * the populate chain covers every ref the type declares as an object. Widen one
 * without the other and it starts lying, silently.
 */
export async function findActiveGroup(userId: string): Promise<matching | null> {
    const freshSince = new Date(Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000);

    return matchingModel
        .findOne({ "participants.user": userId, date: { $gte: freshSince } })
        .sort({ date: 1 })
        .populate(GROUP_POPULATE)
        .lean<matching | null>();
}
