import { connect } from "@/dbConfig/dbConfig";
import mongoose from "mongoose";
import matchingModel from "@/models/matching.js";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { findGroupById } from "@/lib/activeGroup";
import User from "@/models/userModel.js";
import { groupSearchArea, findGroupCandidates, type Point } from "@/lib/groupGeo";
import { buildTasteQuery } from "@/lib/tasteQuery";
import { votingDeadlinePassed, VOTE_LEAD_MINUTES } from "@/lib/groupVote";
import z from "zod"
import Restaurant from "@/models/restaurantModel";
const putschema = z.object(
    {
        approvals :z.array(z.string().trim()),
    }
);

export async function PUT(
    request: NextRequest,
    context: RouteContext<'/api/user/matching/[groupId]/vote'>)
{
    try{
        await connect();
        if (!process.env.TOKEN_SECRET) {
            return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
        }
        
        const token = request.cookies.get("token")?.value;
        const user = getUserFromToken(token);
        if (!user) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }
        
        const { groupId } = await context.params;
        if (!mongoose.isValidObjectId(groupId)) {
            return NextResponse.json({ error: "Invalid group id" }, { status: 400 });
        }
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
        }
        const result=putschema.safeParse(body);
        if(!result.success){
            return NextResponse.json({ error: "Invalid Parse" }, { status: 400 });
        }

        const group = await matchingModel.findById(groupId).lean();
        if (!group) {
            return NextResponse.json({ error: "Group not found" }, { status: 404 });
        }
        /* p.user is the ObjectId itself — .toString() on it, not .id.toString().
           ObjectId HAS an `id` property, but it is the raw 12-byte Buffer, so
           .id.toString() yields binary garbage that never equals the hex string
           in the token and every member fails this check.

           404 with the same text as the missing-group case above: a different
           status or message would let anyone probe which group ids are real. */
        const ingroup = group.participants.some(
            (p: { user: mongoose.Types.ObjectId }) => p.user.toString() === user.id
        );
        if(!ingroup){
            return NextResponse.json({ error: "Group not found" }, { status: 404 });
        }

        /* Split, because the member's next move is opposite in each case: wait
           and nudge the organiser, versus give up because a winner is set. 409
           rather than 400/403 — the request is well formed and the caller is
           permitted; the group's state is what is incompatible. */
        if (group.status === "open") {
            return NextResponse.json(
                { error: "Voting hasn't started — the organiser still has to pick the shortlist." },
                { status: 409 }
            );
        }
        if (group.status !== "voting") {
            return NextResponse.json(
                { error: "Voting has ended for this group." },
                { status: 409 }
            );
        }

        /* First caller of votingDeadlinePassed anywhere. Until now the cutoff
           existed only as a countdown in the browser, so a stale tab or a plain
           curl could vote past it — and a late vote moves leader(), changing the
           answer after the group has read it. `now` defaults to the server
           clock on purpose: the dinner time is the user's intent, the current
           time is a fact. */
        if (votingDeadlinePassed(group)) {
            return NextResponse.json(
                { error: `Voting closed ${VOTE_LEAD_MINUTES} minutes before the table.` },
                { status: 409 }
            );
        }

        /* Deduped here because the pre("save") hook that rejects duplicates does
           not run on updateOne — Mongoose middleware is per-operation, and
           document middleware never fires on a query. Without this a client
           could send the same id twice and double its own weight in tally(). */
        const approvals = [...new Set(result.data.approvals)];

        /* Cast before Mongo sees them. A string that is not a valid ObjectId
           makes Mongoose throw a CastError inside updateOne, which the catch
           below reports as a 500 — but a bad id in the body is a bad request. */
        if (approvals.some((id) => !mongoose.isValidObjectId(id))) {
            return NextResponse.json({ error: "Invalid restaurant id" }, { status: 400 });
        }

        /* Every precondition lives in the FILTER, so the check and the write
           cannot be separated by anything.

           - status: "voting" is compare-and-set, exactly as in the shortlist
             route. The guard above reads a document fetched moments ago; this
             is what makes it true at the instant of writing.
           - $all is the subset check the pre("save") hook would have done:
             the group's restaurants[] must contain every id submitted, so a
             vote for something not on the ballot matches nothing.

           $all is omitted for an empty ballot because `$all: []` matches NO
           documents in MongoDB — and an empty ballot is a case we deliberately
           support ("none of these work for me"). */
        const filter: Record<string, unknown> = {
            _id: groupId,
            status: "voting",
            "participants.user": user.id,
        };
        if (approvals.length > 0) {
            filter.restaurants = { $all: approvals };
        }

        const updated = await matchingModel.updateOne(filter, {
            $set: {
                // $set, never $push: the body is the complete ballot, so
                // re-voting replaces rather than appends.
                "participants.$.approvals": approvals,
                "participants.$.hasVoted": true,
                "participants.$.votedAt": new Date(),
            },
        });

        /* matchedCount, not modifiedCount — resubmitting an identical ballot
           modifies nothing and is still a success.

           Zero means the state moved between the guards above and this write:
           the vote closed, or an id left the shortlist. The guards already
           produced precise messages for everything they could see, so this is
           genuinely "the group changed underneath you". */
        if (updated.matchedCount === 0) {
            return NextResponse.json(
                { error: "The vote changed while you were voting — reload and try again." },
                { status: 409 }
            );
        }

        /* The repopulated group, so the client can re-run tally() against fresh
           data and see everyone's counts, not just its own vote.

           Note what this payload contains: GROUP_POPULATE includes
           participants.approvals, so every member receives every other member's
           individual ballot. That is a product decision, not an accident — and
           visible ballots are known to cause anchoring in approval voting, where
           late voters converge on the current leader instead of stating their
           own preference. If ballots should be private, strip approvals here
           and let the client work from the tally alone. */
        return NextResponse.json({
            message: "Vote recorded",
            success: true,
            group: await findGroupById(groupId),
        });
    }
    catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}