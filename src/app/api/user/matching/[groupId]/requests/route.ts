import mongoose from "mongoose";
import matchingModel from "@/models/matching.js";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { findGroupById } from "@/lib/activeGroup";
import z from "zod"
import { requestVerdict, type RequestOutcome } from "@/lib/groupRequest";
import type { matching } from "@/lib/userContext";

const postSchema = z.object({
    targetId: z.string().trim().min(1),
    action: z.enum(["deny", "approve"]),
});

/* Refusals only — the three success tags are handled by the switch below.
   A table rather than a chain of ifs for the same reason join/route.ts uses
   one: the wording lives in exactly one place, and there is no `||` anywhere
   for the "always truthy string" mistake to hide in.

   409 throughout rather than 403: the request is well formed and the caller is
   permitted to make it — the group's STATE is what is incompatible. 404 for
   group_not_found is deliberately worded the same as any other missing group,
   so the endpoint cannot be used to probe which group ids are real. */
const REFUSALS: Partial<Record<RequestOutcome, { status: number; error: string }>> = {
    group_not_found: { status: 404, error: "Group not found" },
    not_admin: { status: 403, error: "Only a group admin can answer join requests." },
    not_pending: { status: 404, error: "There's no pending request from that person." },
    group_closed: { status: 409, error: "This group has already settled on a place." },
    dinner_passed: { status: 409, error: "This dinner has already happened." },
};

/* One tag -> one response, so the main path and the lost-race path below cannot
   drift apart. That matters more than it looks: the retry path re-runs the
   verdict against freshly read data, and if it mapped tags differently the same
   outcome would reach the admin worded two ways depending on timing. */
function respond(outcome: RequestOutcome, group: matching | null) {
    switch (outcome) {
        case "approved":
            return NextResponse.json({ message: "Request approved", success: true, outcome, group });
        case "denied":
            return NextResponse.json({ message: "Request declined", success: true, outcome, group });
        case "already_participant":
            /* 200, not an error. The admin wanted this person in the group and
               they are — another admin simply got there first. Deny lands here
               too, and the wording is neutral on purpose: it reports the state
               rather than pretending either button did something. */
            return NextResponse.json({
                message: "They're already in the group.",
                success: true,
                outcome,
                group,
            });
        default: {
            const refusal = REFUSALS[outcome];
            return NextResponse.json(
                { error: refusal?.error ?? "That request could not be answered.", outcome },
                { status: refusal?.status ?? 409 }
            );
        }
    }
}

export const POST = withAuth(async (
    request,
    user,
    context: RouteContext<'/api/user/matching/[groupId]/requests'>) =>
{
    try{
        
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

        const result=postSchema.safeParse(body);
        if(!result.success){
            return NextResponse.json({ error: "Invalid Parse" }, { status: 400 });
        }
        if(!mongoose.isValidObjectId(result.data.targetId)){
             return NextResponse.json({ error: "Invalid targetID" }, { status: 400 });
        }
        
        const group = await findGroupById(groupId);
        if (!group) {
            return NextResponse.json({ error: "Group not found" }, { status: 404 });
        }

        /* Populated group, so `admins` holds user objects — hence ._id.toString().
           shortlist/route.ts reads a RAW group and so compares a.toString() on
           the same field; copying that line here would compare against
           "[object Object]" and no admin would ever match. */
        const isAdmin = group.admins.some(
            (a) => a._id.toString() === user.id
        );

        /* No separate `if (!isAdmin) return 403` above this. The verdict takes
           isAdmin precisely so that authorisation is one branch among the others
           rather than a special case — checking it here as well would make the
           table's not_admin entry unreachable, which is how a refusal quietly
           ends up with two different wordings. */
        const reqVerdict = requestVerdict(result.data.targetId, group, isAdmin, result.data.action);
        if (reqVerdict !== "approved" && reqVerdict !== "denied") {
            return respond(reqVerdict, group);
        }

        const updated = reqVerdict === "approved"
                ? await matchingModel.updateOne(
                    { _id: groupId,
                    status: { $ne: "closed" },
                    "pendingRequests.user": result.data.targetId,
                    "participants.user": { $ne: result.data.targetId } },
                    { $pull: { pendingRequests: { user: result.data.targetId } },
                    $push: { participants: { user: result.data.targetId } } })
                : await matchingModel.updateOne(
                    { _id: groupId, "pendingRequests.user": result.data.targetId },
                    { $pull: { pendingRequests: { user: result.data.targetId } } });

        /* matchedCount, not modifiedCount: re-denying someone already gone from
           the queue matches nothing, but re-approving is not the same shape —
           every clause in both filters above corresponds to a verdict tag, so
           zero matched always means one of those preconditions stopped holding
           between the verdict and the write.

           Which is why this re-reads and re-runs the verdict instead of guessing.
           The result object cannot say WHICH clause failed; fresh data can. And
           because the mapping is total, the re-run always lands on a refusal —
           it cannot come back "approved" and report a write that never happened. */
        if (updated.matchedCount === 0) {
            const fresh = await findGroupById(groupId);
            return respond(
                requestVerdict(result.data.targetId, fresh, isAdmin, result.data.action),
                fresh
            );
        }

        return respond(reqVerdict, await findGroupById(groupId));
    }
    catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
});