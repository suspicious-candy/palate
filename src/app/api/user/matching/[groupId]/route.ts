import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import matchingModel from "@/models/matching.js";
import { findGroupById } from "@/lib/activeGroup";
import { z } from "zod";

/* matching.js is untyped, so `group` arrives as `any` and every field access
   would typecheck however it was spelled. Naming the shape locally is the only
   thing standing between a typo and a 500. */
type Participant = { user: mongoose.Types.ObjectId };

/* Explicit boolean, not a bare "toggle" action. A toggle derives the new value
   from whatever the server currently holds, so two admins tapping at the same
   moment flip it twice and land back where they started — with both of their
   screens showing the opposite. Sending the INTENDED state makes the last
   writer win, which is the behaviour a switch is expected to have. */
const patchSchema = z.object({
    membershipOpen: z.boolean(),
});

export const PATCH = withAuth(async (
    request,
    user,
    context: RouteContext<'/api/user/matching/[groupId]'>) =>
{
    try {
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

        const result = patchSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        /* Raw: this handler only compares ids. On a lean document
           participants.user and admins[] are ObjectIds themselves — .toString()
           on them, never ._id.toString(), which is the populated spelling. */
        const group = await matchingModel.findById(groupId).lean();
        if (!group) {
            return NextResponse.json({ error: "Group not found" }, { status: 404 });
        }

        const participants: Participant[] = group.participants;
        const ingroup = participants.some((p) => p.user.toString() === user.id);
        if (!ingroup) {
            // Same wording as the missing-group case, so this cannot be used to
            // probe which group ids are real.
            return NextResponse.json({ error: "Group not found" }, { status: 404 });
        }

        const isAdmin = group.admins.some(
            (a: mongoose.Types.ObjectId) => a.toString() === user.id
        );
        if (!isAdmin) {
            return NextResponse.json(
                { error: "Only a group admin can change the guest list" },
                { status: 403 }
            );
        }

        /* No status gate, deliberately. models/matching.js says membershipOpen is
           "orthogonal to `status`, which governs the vote" — locking the roster
           and running the vote are separate decisions, and coupling them here
           would quietly make that comment false. An admin can freeze the guest
           list mid-vote, which is the main reason the field exists.

           No compare-and-set either: the request carries the intended value
           rather than a flip, so there is no read-modify-write to lose. Two
           admins racing both write a value they actually chose. */
        await matchingModel.updateOne(
            { _id: groupId },
            { $set: { membershipOpen: result.data.membershipOpen } }
        );

        return NextResponse.json({
            message: result.data.membershipOpen
                ? "Guest list reopened"
                : "Guest list locked",
            success: true,
            group: await findGroupById(groupId),
        });
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
});
