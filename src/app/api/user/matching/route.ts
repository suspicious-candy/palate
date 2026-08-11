import { connect } from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js";
import matchingModel from "@/models/matching.js";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { z } from "zod";
import { listFriends } from "@/lib/friends";
import { findActiveGroup, findGroupById } from "@/lib/activeGroup";
import { VOTE_LEAD_MINUTES } from "@/lib/groupVote";
import { closeVote } from "@/lib/closeVote";
import { generateInviteCode } from "@/lib/inviteCode";

/* Voting shuts VOTE_LEAD_MINUTES before dinner, so a group booked any nearer
   than that is born with the vote already closed. Expressed in terms of the
   deadline rather than as a standalone number: the real rule is "there must be
   a usable voting window", and writing it this way keeps that true if either
   constant moves. The extra hour is the window itself. */
const MIN_LEAD_MINUTES = VOTE_LEAD_MINUTES + 60;

const DEFAULT_GROUP_NAME = "Tonight's Table";

/* Shape only. Whether these ids belong to actual friends is a question for the
   database, not the parser — see the membership check in POST. */
export const postSchema = z.object({
    name: z.string().trim().max(60).optional(),
    /* coerce, not z.date(): request.json() yields a string because JSON has no
       date type, so z.date() would reject every request. coerce parses it and
       rejects unparseable input, which also handles the Invalid Date case —
       NaN compares false against everything, so an unchecked bad date would
       slip past the lead-time guard below. */
    date: z.coerce.date(),
    friendsIds: z.array(z.string()).default([]),
});

export async function GET(request: NextRequest) {
    try {
        await connect();

        if (!process.env.TOKEN_SECRET) {
            return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
        }

        /* proxy.ts only checks that a cookie named "token" exists — it never
           verifies the signature, so it is a UX gate, not an authorization
           boundary. Every route re-establishes identity for itself. */
        const token = request.cookies.get("token")?.value;
        const user = getUserFromToken(token);
        if (!user) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        let group = await findActiveGroup(user.id);
        if(group!=null){
            try{
            const closeResult = await closeVote(group);
            if(closeResult==="closed"){
                group = await findGroupById(group._id);
            }}catch(error:any){
                console.error("cant find the closed group");
            }
        }

        /* Having no group is a normal answer, not an error — most users, most
           of the time. Returning null with a 200 saves every caller a catch. */
        return NextResponse.json({
            message: "Group fetch successful",
            success: true,
            group,
        });
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        await connect();

        if (!process.env.TOKEN_SECRET) {
            return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
        }

        const token = request.cookies.get("token")?.value;
        const user = getUserFromToken(token);
        if (!user) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }
        const userId = user.id;

        const result = postSchema.safeParse(await request.json());
        if (!result.success) {
            return NextResponse.json(
                { error: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        /* "now" is the server's clock, never the client's. The dinner time comes
           from the request because it is the user's intent; the current time is
           a fact, and a client that supplied it could book a dinner minutes away
           by lying about what time it is. */
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

        /* Deduped, and with the caller stripped: they are added as participant
           zero below. A repeated id would otherwise become two participant
           subdocuments for one person — inflating the vote denominator and
           letting them approve twice. */
        const invitedIds = [...new Set(result.data.friendsIds)].filter(
            (id) => id !== userId
        );

        /* The modal only offers friends, but a request is not a form: anyone can
           POST any user id here. The client's list is a UI convenience; the
           server re-derives who you are actually allowed to add.

           Rejecting the whole request rather than dropping the strangers — no
           legitimate path produces one, so it is a client bug or someone poking
           at the endpoint, and both deserve to be visible. */
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
           of participants[] rather than from a pointer on each user document,
           so there is no second write to keep in sync and nothing that can
           drift. `status` and `membershipOpen` come from schema defaults;
           `restaurants` stays empty until an admin starts the vote, which is
           also what stops anyone voting early — the pre-save hook rejects any
           approval that is not in restaurants[]. */
        /* Retry rather than pre-check. "Generate a code, ask whether it exists,
           insert if not" reads safer and is not: the read and the write are two
           operations, and two simultaneous creations can both see nothing and
           both insert. The unique index is the authority — let it reject, then
           draw a fresh code.

           Only 11000 is caught, and anything else rethrows. A blanket catch
           would swallow a genuine database failure and then retry straight back
           into it. Same shape as the friendship race in lib/friends.ts.

           Three attempts is theatre at ~50 bits of entropy, but the alternative
           to handling it at all is a 500 on group creation. */
        let created = null;
        for (let attempt = 0; attempt < 3 && created === null; attempt++) {
            try {
                created = await matchingModel.create({
                    name: result.data.name || DEFAULT_GROUP_NAME,
                    /* Distinct from admins[0], which is mutable the moment
                       promotion and demotion exist. This one never changes, and
                       is what any "you cannot demote the organiser" rule has to
                       be anchored on. */
                    createdBy: userId,
                    // The admin votes too: they are a participant AND an admin. Omitting
                    // the first would compute every "3 of 5 voted" against a short count.
                    participants: [userId, ...invitedIds].map((id) => ({ user: id })),
                    admins: [userId],
                    /* Minted here so every group is shareable from the moment it
                       exists — no second endpoint, no empty state in the UI.
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

        /* By id, not findActiveGroup: a user can be in several groups at once,
           so "the soonest" is not necessarily the one just created. */
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
}
