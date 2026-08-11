import matchingModel from "@/models/matching.js";
/* Side-effect imports, not dead code: Mongoose resolves `ref: "restaurants"`
   by looking the model up BY NAME in its registry, so a module that never
   imports these makes populate() throw MissingSchemaError. Required here
   because the populate chain below follows refs into both collections. */
import "@/models/restaurantModel.js";
import "@/models/userModel.js";
import type { matching } from "@/lib/userContext";
/* Imports point one way: this impure module reaches into pure groupVote, never
   the reverse. STALE_AFTER_HOURS lives there so groupAdmission can share it
   without pulling a Mongoose model into a pure decision function. */
import { STALE_AFTER_HOURS } from "@/lib/groupVote";

/* A user's current group, found by querying the matching collection directly.

   There is deliberately no pointer on the user document. A denormalized
   `user.matchingGroup` would have to be written alongside every membership
   change — two documents per write, in a database where transactions need a
   replica set — and the two can drift. Querying `participants.user` makes
   `participants[]` the single source of truth, so creating a group is one
   insert and adding someone is one $push. Nothing can disagree with anything.

   The cost is an index, added in matching.js. */

/** The five fields FriendSummary declares.

    A populated subdocument does NOT inherit the outer query's .select(), so
    without this every participant's password hash, email and phone would ship
    to the browser alongside their avatar initials. */
export const USER_SUMMARY = "username firstName lastName profilePic";

/* One chain, used by every lookup that returns a group.

   The `matching` return type is a claim, not a guarantee: it holds only while
   this covers every ref the type declares as an object. Widen the type without
   widening this and it silently starts lying — which is why both finders share
   it rather than each spelling out their own. */
const GROUP_POPULATE = [
    { path: "participants.user", select: USER_SUMMARY },
    { path: "participants.approvals" },
    { path: "restaurants" },
    { path: "winner" },
    { path: "admins", select: USER_SUMMARY },
    /* Same projection as every other user ref, and for the same reason: an
       admin reviewing the queue is shown a stranger's card, and without an
       explicit select that card would carry the stranger's password hash and
       email to the browser alongside their avatar. */
    { path: "pendingRequests.user", select: USER_SUMMARY },
];

/**
 * One group by id, populated identically to findActiveGroup.
 *
 * POST needs this rather than findActiveGroup: a user can be in several groups,
 * so "the soonest" is not necessarily the one just created.
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
 * The group to show this user, or null.
 *
 * "Current" is the soonest dinner that has not gone stale. A user can be in
 * several groups at once — a work lunch and a Friday dinner do not conflict —
 * and this picks the most imminent rather than pretending only one can exist.
 * When the UI grows a group list, this becomes `find` and nothing else moves.
 *
 * The `matching` return type is a claim, not a guarantee: it holds only while
 * the populate chain below covers every ref the type declares as an object.
 * Widen one without the other and it silently starts lying.
 */
export async function findActiveGroup(userId: string): Promise<matching | null> {
    const freshSince = new Date(Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000);

    return matchingModel
        .findOne({ "participants.user": userId, date: { $gte: freshSince } })
        .sort({ date: 1 })
        .populate(GROUP_POPULATE)
        .lean<matching | null>();
}
