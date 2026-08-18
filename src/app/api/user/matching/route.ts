import User from "@/models/userModel.js";
import matchingModel from "@/models/matching.js";
import { NextResponse } from "next/server";
import { withAuth, withVerified } from "@/lib/withAuth";
import { z } from "zod";
import { listFriends } from "@/lib/friends";
import { findUserGroups, findGroupById } from "@/lib/activeGroup";
import { VOTE_LEAD_MINUTES, votingDeadlinePassed } from "@/lib/groupVote";
import { closeVote } from "@/lib/closeVote";
import { generateInviteCode } from "@/lib/inviteCode";

/* Voting shuts VOTE_LEAD_MINUTES before dinner, so a group booked any nearer
   than that is born with the vote already closed. Expressed in terms of the
   deadline rather than as a standalone number, because the real rule is that
   there must be a usable voting window, and writing it this way keeps that true
   if either constant moves. The extra hour is the window itself. */
const MIN_LEAD_MINUTES = VOTE_LEAD_MINUTES + 60;

const DEFAULT_GROUP_NAME = "Tonight's Table";

/* Shape only. Whether these ids belong to actual friends is a question for the
   database rather than the parser — see the membership check in POST. */
export const postSchema = z.object({
    name: z.string().trim().max(60).optional(),
    /* coerce rather than z.date(). request.json() yields a string because JSON
       has no date type, so z.date() would reject every request. coerce parses it
       and rejects unparseable input, which also handles the Invalid Date case:
       NaN compares false against everything, so an unchecked bad date would slip
       past the lead-time guard below. */
    date: z.coerce.date(),
    friendsIds: z.array(z.string()).default([]),
});

/* Every group the user is in, for the groups tab.
 *
 * This was previously "the single active group", which nothing ever called: the
 * dashboard attaches its own via findActiveGroup, and the detail page now
 * fetches by id. Reshaped rather than added alongside, so there is one list
 * endpoint instead of a list endpoint and a vestigial one.
 */
export const GET = withAuth(async (request, user) => {
    try {
        let groups = await findUserGroups(user.id);

        /* Closing a vote is a side effect of somebody looking — closeVote notes
           that nothing else ever forces the transition. So the list has to do it
           too, or a group whose deadline passed sits at "voting" forever and the
           row lies about it.

           Only the genuinely due ones, and each re-fetched in full first.
           closeVote needs the heavy populate this list deliberately skips, and
           handing it a summary would count every ballot as zero and close the
           group with no winner, silently. Normally `due` is empty and this whole
           block costs one filter. */
        const due = groups.filter(
            (g) => g.status === "voting" && votingDeadlinePassed(g)
        );

        if (due.length > 0) {
            let closedAny = false;
            for (const summary of due) {
                try {
                    const full = await findGroupById(summary._id);
                    if (full && (await closeVote(full)) === "closed") closedAny = true;
                } catch (error: any) {
                    /* One group failing to close must not cost the user the
                       whole list. The row is stale, not missing. */
                    console.error("closeVote failed for group", summary._id, error?.message);
                }
            }
            if (closedAny) groups = await findUserGroups(user.id);
        }

        /* Being in no groups is a normal answer rather than an error, for most
           users most of the time. An empty array with a 200 saves every caller a
           catch. */
        return NextResponse.json({
            message: "Groups fetch successful",
            success: true,
            groups,
        });
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
});

/* Verified accounts only, because creating a group mints an invite code that
   gets forwarded to other people. GET stays open so an unverified user can still
   see a group. */
export const POST = withVerified(async (request, user) => {
    try {
        const userId = user.id;

        const result = postSchema.safeParse(await request.json());
        if (!result.success) {
            return NextResponse.json(
                { error: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        /* "now" is the server's clock, never the client's. The dinner time comes
           from the request because it is the user's intent, whereas the current
           time is a fact, and a client that supplied it could book a dinner
           minutes away by lying about what time it is. */
        const dinnerAt = result.data.date.getTime();
        if (dinnerAt < Date.now() + MIN_LEAD_MINUTES * 60 * 1000) {
            return NextResponse.json(
                {
                    error: `Dinner has to be at least ${MIN_LEAD_MINUTES} minutes away — voting closes ${VOTE_LEAD_MINUTES} minutes before the table, so anything sooner leaves no time to vote.`,
                },
                { status: 400 }
            );
        }

        if (!(await User.exists({ _id: userId }))) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        /* Deduped, with the caller stripped, since they are added as participant
           zero below. A repeated id would otherwise become two participant
           subdocuments for one person, inflating the vote denominator and
           letting them approve twice. */
        const invitedIds = [...new Set(result.data.friendsIds)].filter(
            (id) => id !== userId
        );

        /* The modal only offers friends, but a request is not a form: anyone can
           POST any user id here. The client's list is a UI convenience, and the
           server re-derives who the caller is actually allowed to add.

           The whole request is rejected rather than the strangers dropped. No
           legitimate path produces one, so it is either a client bug or someone
           poking at the endpoint, and both deserve to be visible. */
        const friends = await listFriends(userId);
        const friendIds = new Set(friends.map((f: any) => f._id.toString()));

        const notFriends = invitedIds.filter((id) => !friendIds.has(id));
        if (notFriends.length > 0) {
            return NextResponse.json(
                { error: "Invalid friend added", ids: notFriends },
                { status: 400 }
            );
        }

        /* One insert, and that is the entire write. Membership is read back out
           of participants[] rather than from a pointer on each user document, so
           there is no second write to keep in sync and nothing that can drift.
           `status` and `membershipOpen` come from schema defaults, and
           `restaurants` stays empty until an admin starts the vote — which is
           also what stops anyone voting early, since the pre-save hook rejects
           any approval that is not in restaurants[]. */
        /* Retry rather than pre-check. "Generate a code, ask whether it exists,
           insert if not" reads safer and is not: the read and the write are two
           operations, and two simultaneous creations can both see nothing and
           both insert. The unique index is the authority, so it rejects and a
           fresh code is drawn.

           Only 11000 is caught, and anything else rethrows. A blanket catch would
           swallow a genuine database failure and then retry straight back into
           it. The same shape appears in the friendship race in lib/friends.ts.

           Three attempts is close to theatre at around 50 bits of entropy, but
           the alternative to handling it at all is a 500 on group creation. */
        let created = null;
        for (let attempt = 0; attempt < 3 && created === null; attempt++) {
            try {
                created = await matchingModel.create({
                    name: result.data.name || DEFAULT_GROUP_NAME,
                    /* Distinct from admins[0], which becomes mutable the moment
                       promotion and demotion exist. This one never changes, and
                       is what any "the organiser cannot be demoted" rule has to
                       be anchored on. */
                    createdBy: userId,
                    // The admin votes too, so they are both a participant and an admin.
                    // Omitting the first computes every "3 of 5 voted" against a short count.
                    participants: [userId, ...invitedIds].map((id) => ({ user: id })),
                    admins: [userId],
                    /* Minted here so every group is shareable from the moment it
                       exists: no second endpoint, no empty state in the UI.
                       Rotation is a later action, and it is possible only
                       because this is its own field rather than the group's
                       _id. */
                    inviteCode: generateInviteCode(),
                    restaurants: [],
                    date: result.data.date,
                });
            } catch (error: any) {
                if (error?.code !== 11000) throw error;
            }
        }

        if (created === null) {
            return NextResponse.json(
                { error: "Could not allocate an invite code — please try again." },
                { status: 500 }
            );
        }

        /* By id rather than findActiveGroup: a user can be in several groups at
           once, so "the soonest" is not necessarily the one just created. */
        return NextResponse.json(
            {
                message: "Group created",
                success: true,
                group: await findGroupById(created._id.toString()),
            },
            { status: 201 }
        );
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
});
