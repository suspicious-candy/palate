import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { findGroupById } from "@/lib/activeGroup";
import { closeVote } from "@/lib/closeVote";
import { totalCount, votedCount } from "@/lib/groupVote";

export const POST = withAuth(async (
    request,
    user,
    context: RouteContext<'/api/user/matching/[groupId]/close'>) =>
{
    try{
        const { groupId } = await context.params;
        if (!mongoose.isValidObjectId(groupId)) {
            return NextResponse.json({ error: "Invalid group id" }, { status: 400 });
        }
        /* No request body. Everything this route needs is already in the database,
           and a body would only give the client something to lie about. */

        /* findGroupById, not findById().lean() as in the other three routes.
           closeVote runs tally(), which identifies restaurants by fsqId, and a
           bare ObjectId reference does not have one, so a raw document counts zero
           votes for everything and the group closes with no winner. That failure
           is indistinguishable from nobody having voted. */
        let group = await findGroupById(groupId);
        if (!group) {
            return NextResponse.json({ error: "Group not found" }, { status: 404 });
        }

        /* Populated, so participants.user is a whole user object and admins[]
           holds user objects too, hence ._id.toString() on both. The vote route's
           plain .toString() is correct there because it reads a raw document;
           here it would stringify an object to "[object Object]" and no member
           would ever match.

           404 with the same text as the missing-group case, because a different
           status or message would let anyone probe which group ids are real. */
        const ingroup = group.participants.some(
            (p) => p.user._id.toString() === user.id
        );
        if(!ingroup){
            return NextResponse.json({ error: "Group not found" }, { status: 404 });
        }

        /* 403 rather than 404. The caller is in the group, so there is nothing
           left to hide and a lie would be worse than useless. */
        const isAdmin = group.admins.some(
            (a) => a._id.toString() === user.id
        );
        if(!isAdmin){
            return NextResponse.json({ error: "Not authorised" }, { status: 403 });
        }
        if (group.status === "open") {
            return NextResponse.json(
                { error: "Voting hasn't started — the organiser still has to pick the shortlist." },
                { status: 409 }
            );
        }
        if (group.status === "closed") {
            return NextResponse.json(
                { error: "Already done" },
                { status: 409 }
            );
        }

        /* Counted before closing, because closing is exactly what strands these
           people. Closing early throws away the ballots of everyone who had not
           voted yet, and an organiser who silently discards three friends' votes
           will hear about it at dinner, so the response has to say how many. */
        const invited = totalCount(group);
        const voted = votedCount(group);

        const closedResult = await closeVote(group,{force:true});

        if(closedResult==="already-closed"){
            return NextResponse.json(
                { error: "Group is already closed" },
                { status: 409 }
            );
        }
        if(closedResult==="not-due"){
            return NextResponse.json(
                { error: "Something went wrong with forced close" },
                { status: 500 }
            );
        }
        /* Re-fetched because the copy in hand still says status "voting" with
           winner null: closeVote changed the database, not this object. Skip it
           and the admin presses "close voting", gets a success response, and sees
           a screen that still says voting is open.

           Assigned to `group` and used once, because calling findGroupById twice
           would run the whole populate chain a second time for nothing. */
        group = await findGroupById(groupId);

        return NextResponse.json({
            message: "Voting closed",
            success: true,
            group,
            /* What the client cannot derive from the group document. Closing
               early is a choice with a cost, and this is its size. */
            closedEarly: {
                invited,
                voted,
                strandedVotes: invited - voted,
            },
        });
    }
    catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
});