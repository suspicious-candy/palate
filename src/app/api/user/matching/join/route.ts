import { NextResponse } from "next/server";
import { admissionVerdict, type AdmissionOutcome } from "@/lib/groupAdmission";
import { withVerified } from "@/lib/withAuth";
import { z } from "zod";
import { findGroupByInviteCode, findGroupById } from "@/lib/activeGroup";
import { areFriendsWithAny } from "@/lib/friends";
import matchingModel from "@/models/matching.js";
import type { matching } from "@/lib/userContext";

/* The code travels in the body rather than the path. Path segments are written
   to access logs, proxy logs and analytics by default, and a POST body is not.
   The invite code is not a password — the friendship check below is what
   actually decides admission — but there is no reason to scatter it either. */
const postschema = z.object({
    inviteCode: z.string().trim().min(1),
});

/* Refusals only. Each one is a different problem with a different remedy, which
   is the entire reason admissionVerdict returns tags instead of a boolean:
   "settled" means give up, "locked" means go ask the organiser, and a joiner
   who cannot tell them apart has no idea what to do next.

   409 throughout rather than 403: the request is well formed and the caller is
   permitted to make it, and the group's state is what is incompatible. The same
   reasoning applies in the vote route. 404 is the exception, and it is
   deliberately identical for an unknown code and a deleted group so the endpoint
   cannot be used to probe which codes are real. */
const REFUSALS: Partial<Record<AdmissionOutcome, { status: number; error: string }>> = {
    group_not_found: { status: 404, error: "That invite link isn't valid." },
    group_closed: { status: 409, error: "This group has already settled on a place." },
    dinner_passed: { status: 409, error: "This dinner has already happened." },
    roster_locked: { status: 409, error: "The organiser has locked the guest list." },
    queue_full: { status: 409, error: "This group has too many pending requests." },
};

/* Everything that is not a refusal. Three of these are plain successes, and one
   — "queued" — is a success that reads like a refusal, so it gets 202 Accepted:
   the request was taken and the decision is pending a human. */
function success(outcome: AdmissionOutcome, group: matching | null) {
    switch (outcome) {
        case "admitted":
            return NextResponse.json({ success: true, state: "joined", group });
        case "already_participant":
            /* Not an error. Someone re-opening the only link they kept must land
               in their group rather than be told they cannot join a dinner they
               are already going to. */
            return NextResponse.json({ success: true, state: "joined", group });
        case "queued":
        case "already_pending":
            /* No group payload. GROUP_POPULATE pulls in participants.approvals
               and the restaurant shortlist, so returning the group here would
               hand a stranger everyone's ballots, and the approval step would be
               protecting nothing. Only what the public join page already shows
               goes back. */
            return NextResponse.json(
                { success: true, state: "pending", groupName: group?.name ?? null },
                { status: outcome === "queued" ? 202 : 200 }
            );
        default: {
            const refusal = REFUSALS[outcome];
            return NextResponse.json(
                { error: refusal?.error ?? "You can't join this group." },
                { status: refusal?.status ?? 409 }
            );
        }
    }
}

/* Verified accounts only: joining puts the caller in front of other people, as
   either a request the organiser sees or a name added to the roster. */
export const POST = withVerified(async (request, user) => {
    try {
        const userId = user.id;

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
        }

        const result = postschema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const group = await findGroupByInviteCode(result.data.inviteCode);
        /* Narrowed here rather than left to `?.` at every use below. It is also
           the group_not_found outcome, so one check does both jobs. */
        if (!group) {
            return success("group_not_found", null);
        }

        /* A first pass with `false`. isFriendOfAdmin is consulted on the last line
           of admissionVerdict and nowhere else, so anything other than "queued"
           coming back means the friendship graph was irrelevant and the
           friendship collection is never touched. That skip is the whole reason
           the flag is a parameter instead of a lookup inside the function. */
        const cheapVerdict = admissionVerdict(userId, group, false);
        if (cheapVerdict !== "queued") {
            return success(cheapVerdict, group);
        }

        /* Admins only. Friend-of-a-participant is deliberately not a path: a
           quiet member's entire friend list walking in is not something any admin
           agreed to. Strangers queue, which is what the approval screen is
           for. */
        const adminIds = group.admins.map((a) => a._id.toString());
        const isFriendOfAdmin = await areFriendsWithAny(userId, adminIds);

        const verdict = admissionVerdict(userId, group, isFriendOfAdmin);

        /* Compare-and-set. Every precondition lives in the filter rather than in
           an if-statement above it: the verdict was computed from a group read a
           network round trip ago, and an admin can close the group or lock the
           roster in that window.

           `$ne` on a dotted array path means no element matches, rather than
           "some element differs", which is exactly the guard needed and what
           makes a double-click safe. $addToSet would not work here: it compares
           whole subdocuments, and a pending entry carries a requestedAt that
           differs on every call, so two clicks would both count as new.

           membershipOpen uses { $ne: false } rather than true because every group
           created before that field existed has no value for it, and a filter of
           `true` does not match a missing field — see the note on the schema. The
           same applies to status. */
        const gates = {
            _id: group._id,
            status: { $ne: "closed" },
            membershipOpen: { $ne: false },
            "participants.user": { $ne: userId },
        };

        const write =
            verdict === "admitted"
                ? await matchingModel.updateOne(gates, {
                      $push: { participants: { user: userId } },
                  })
                : await matchingModel.updateOne(
                      { ...gates, "pendingRequests.user": { $ne: userId } },
                      /* requestedAt is set here rather than defaulted in the
                         schema: the admin queue is sorted by it, and a missing
                         value would sort arbitrarily. The PENDING_LIMIT cap is
                         enforced by the verdict rather than by this filter, so a
                         burst of simultaneous joins can overshoot it by a few —
                         acceptable slack for a number that exists to bound how
                         many cards a human reads. */
                      { $push: { pendingRequests: { user: userId, requestedAt: new Date() } } }
                  );

        /* matchedCount rather than modifiedCount. Zero means a precondition
           failed between the verdict and this write, and the result object cannot
           say which, so this re-reads and lets admissionVerdict explain it. The
           write is the authority; the re-read produces an honest message. */
        if (write.matchedCount === 0) {
            const fresh = await findGroupById(group._id);
            return success(admissionVerdict(userId, fresh, isFriendOfAdmin), fresh);
        }

        /* Repopulated only on the path that is entitled to it. */
        return success(
            verdict,
            verdict === "admitted" ? await findGroupById(group._id) : group
        );
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
});
