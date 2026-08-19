import mongoose from "mongoose";
import matchingModel from "@/models/matching.js";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { findGroupById } from "@/lib/activeGroup";
import User from "@/models/userModel.js";
import { groupSearchArea, findGroupCandidates, type Point } from "@/lib/groupGeo";
import { buildTasteQuery } from "@/lib/tasteQuery";
import { loadLearnedCuisines } from "@/lib/tasteSignal";
import { RECOMMENDER_URL } from "@/lib/recommender";

/* matching.js is untyped, so `group` is `any` and every field access would
   typecheck no matter how it was spelled. Naming the shape locally is the only
   thing standing between a typo and a 500. */
type Participant = {
    user: mongoose.Types.ObjectId;
    location?: { type: "Point"; coordinates: Point };
};

/* Ballot size. Long enough that the group has a real choice, short enough that
   everyone actually reads it. groupGeo's notes already assume around seven. */
const SHORTLIST_SIZE = 7;

/* The service is fast once warm but loads a sentence-transformer on its first
   request, so the ceiling is set by the cold start rather than the search. */
const RECOMMENDER_TIMEOUT_MS = 20_000;

/* Vercel kills a serverless function at its maxDuration, and the platform
   default is shorter than the timeout above — so on the default the platform
   would abort this route BEFORE its own AbortSignal fired, turning a slow
   recommender into a 504 with no log line from this handler and no chance to
   answer the 503 the catch below is written to produce.

   30 rather than exactly 20: the recommender call is the long pole, but the geo
   query, the user lookup and the ballot write all happen around it. */
export const maxDuration = 30;

export const POST = withAuth(async (
    request,
    user,
    context: RouteContext<'/api/user/matching/[groupId]/shortlist'>
) => {
    try {

        const { groupId } = await context.params;
        if (!mongoose.isValidObjectId(groupId)) {
            return NextResponse.json({ error: "Invalid group id" }, { status: 400 });
        }

        /* Raw rather than findGroupById. Populating would replace
           participants.user with a summary that carries no preferences, and
           replace restaurants with documents about to be overwritten anyway. */
        const group = await matchingModel.findById(groupId).lean();
        if (!group) {
            return NextResponse.json({ error: "Group not found" }, { status: 404 });
        }

        /* 403 rather than 404. Unlike the location route there is nothing to
           hide: the caller is a known participant who simply is not the
           organiser. Starting the vote freezes the ballot for everyone. */
        const isAdmin = group.admins.some(
            (a: mongoose.Types.ObjectId) => a.toString() === user.id
        );
        if (!isAdmin) {
            return NextResponse.json(
                { error: "Only a group admin can start the vote" },
                { status: 403 }
            );
        }

        /* A fast-fail courtesy only. The real guarantee is the compare-and-set in
           the final update, because everything between here and there takes long
           enough for a second admin to arrive. */
        if (group.status !== "open") {
            return NextResponse.json(
                { error: "This group's vote has already started" },
                { status: 409 }
            );
        }

        const participants: Participant[] = group.participants;

        /* The circle is anchored on the admin and only ever grows around them, so
           without their location there is no search to run at all. This reads the
           admin's participant entry: their authorisation was settled above, and
           this is purely about where they are. */
        const adminEntry = participants.find((p) => p.user.toString() === user.id);
        const adminPoint = adminEntry?.location?.coordinates;
        if (!adminPoint) {
            return NextResponse.json(
                { error: "Open the group once with location enabled — the search is centred on you." },
                { status: 400 }
            );
        }

        /* Its own array, in a fixed order, because groupSearchArea reports
           excludedMembers as indices into it rather than as user ids. `?? null`
           rather than filtering: dropping locationless members would shorten the
           array and make every excluded index point at the wrong person. */
        const others = participants.filter((p) => p.user.toString() !== user.id);
        const area = groupSearchArea(
            adminPoint,
            others.map((p) => p.location?.coordinates ?? null)
        );

        const candidates = await findGroupCandidates(area);
        if (candidates.length === 0) {
            return NextResponse.json(
                {
                    error: `No restaurants within ${Math.round(area.radiusKm)}km of the group.`,
                    radiusKm: area.radiusKm,
                },
                { status: 404 }
            );
        }

        /* Its own query rather than widening USER_SUMMARY, which is the privacy
           boundary for every group read that ships to the browser. This result
           never leaves the server. */
        const participantIds = participants.map((p) => p.user);
        const users = await User.find({ _id: { $in: participantIds } })
            .select("preferences firstName lastName")
            .lean();

        /* Keyed rather than indexed: find() gives no ordering guarantee, so
           position here does not correspond to position in `participants`. Used
           in the response to name members excluded for distance. */
        const prefsByUser = new Map(users.map((u: any) => [u._id.toString(), u]));

        /* No exclusion pass. There used to be one here: a union of every member's
           `disliked` cuisines, applied as a hard filter before ranking, on the
           reasoning that one person's refusal disqualifies a restaurant for the
           whole group. That field is no longer tracked, so the ballot is now
           shaped by attraction alone — whatever /recommend/group ranks highest
           across the members who stated a taste.

           `allergines` was never folded in and still is not. It is free text
           compared against cuisine names, so "peanuts" cannot match "Thai
           Restaurant", and filtering on it would look like allergen safety while
           doing nothing. The UI has to say plainly that allergens are not
           checked. */

        /* Two arrays kept in step. /recommend/group returns memberSims in member
           order, so without the ids there is no way to say whose taste a pick
           reflects.

           Members with no stated taste are skipped rather than given a generic
           sentence. A neutral phrase sits near the corpus centre, and the service
           z-scores each member's row before aggregating, which would promote that
           noise to a full-strength vote and — since blend is half least-misery —
           let it set the minimum. */
        /* One batched query for the whole group, hoisted out of the loop below.
           The per-user shape of loadLearnedCuisines exists for exactly this:
           calling it inside the loop would be a database round trip per member. */
        const learnedByUser = await loadLearnedCuisines(
            participantIds.map((id) => id.toString())
        );

        const queries: string[] = [];
        const memberIds: string[] = [];
        for (const u of users as any[]) {
            const id = u._id.toString();
            const query = buildTasteQuery(u.preferences ?? null, learnedByUser.get(id) ?? []);
            if (query !== null) {
                queries.push(query);
                memberIds.push(id);
            }
        }
        const skippedMembers = participants.length - memberIds.length;

        if (queries.length === 0) {
            return NextResponse.json(
                { error: "Nobody in this group has set their food preferences yet." },
                { status: 400 }
            );
        }
        /* Restaurant ids, not member ids. Both arrays are lists of strings, so
           swapping them typechecks perfectly and the service answers 404 — "none
           of the candidateIds are in the index" — a failure that reads like a
           stale index rather than a wiring mistake. */
        const candidateIds = candidates.map((r: any) => r.fsqId);



        let ranking: { businessIds: string[]; agreement?: number };
        try {
            const recRes = await fetch(`${RECOMMENDER_URL}/recommend/group`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    queries,
                    candidateIds,
                    strategy: "blend",
                    alpha: 0.5,
                    k: SHORTLIST_SIZE,
                }),
                signal: AbortSignal.timeout(RECOMMENDER_TIMEOUT_MS),
            });

            if (!recRes.ok) {
                const detail = await recRes.text();
                console.error("Group recommend failed:", recRes.status, detail);
                return NextResponse.json(
                    {
                        error: recRes.status === 404
                            ? "None of the nearby restaurants have been indexed yet."
                            : "The recommender could not rank these restaurants.",
                    },
                    { status: 503 }
                );
            }

            ranking = await recRes.json();
        } catch (err: any) {
            /* 503 and no shortlist, deliberately the opposite of what
               nearby/route.ts does when this same service is down. A degraded
               browsing list is something the user scrolls past. A degraded
               shortlist is seven restaurants picked by proximity, frozen into a
               ballot and presented as though taste shaped it, with nobody able to
               tell it happened. When the failure is invisible and the artefact is
               permanent, fail loudly. */
            console.error("Group recommend unreachable:", err?.message ?? err);
            return NextResponse.json(
                { error: "The recommender is unavailable — the vote was not started." },
                { status: 503 }
            );
        }

        /* The service speaks fsqIds while matching.restaurants holds ObjectIds.
           The map is built from `candidates`, which is where candidateIds came
           from, so every returned id resolves. .filter(Boolean) is there so a
           mismatch drops that entry instead of writing an undefined into the
           ballot. */
        const idByFsqId = new Map<string, mongoose.Types.ObjectId>(
            candidates.map((r: any) => [r.fsqId, r._id])
        );
        const restaurantIds = ranking.businessIds
            .map((fsqId) => idByFsqId.get(fsqId))
            .filter(Boolean)
            .slice(0, SHORTLIST_SIZE);

        if (restaurantIds.length === 0) {
            console.error("Ranking returned no resolvable ids", ranking.businessIds.slice(0, 5));
            return NextResponse.json(
                { error: "The recommender returned nothing we could put on a ballot." },
                { status: 503 }
            );
        }

        /* Compare-and-set. `status: "open"` belongs in the filter rather than in
           an if-statement: since the check near the top of this handler, a geo
           query, a user lookup and a network round trip have run, which is ample
           time for a second admin to enter the same route. Both would pass an
           early check, whereas here the first write flips the status and the
           loser's filter matches nothing.

           Rebuilding a ballot mid-vote would also wedge the group, because the
           pre("save") hook rejects approvals no longer in restaurants[], so the
           document could never be saved again. */
        const started = await matchingModel.updateOne(
            { _id: groupId, status: "open" },
            { $set: { restaurants: restaurantIds, status: "voting" } }
        );

        if (started.matchedCount === 0) {
            return NextResponse.json(
                { error: "Another admin started the vote first." },
                { status: 409 }
            );
        }

        /* excludedMembers are indices into `others`, so they are resolved back
           through that array and then through prefsByUser, never by position in
           `users`, which find() returns in arbitrary order. */
        const excludedMembers = area.excludedMembers.map((i) => {
            const id = others[i].user.toString();
            const u: any = prefsByUser.get(id);
            return { userId: id, firstName: u?.firstName ?? null };
        });

        return NextResponse.json({
            message: "Shortlist created",
            success: true,
            group: await findGroupById(groupId),
            shortlist: {
                radiusKm: area.radiusKm,
                excludedMembers,
                skippedMembers,
                rankedMembers: memberIds.length,
                agreement: ranking.agreement ?? null,
            },
        });
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
});
