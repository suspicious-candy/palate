import { connect } from "@/dbConfig/dbConfig";
import mongoose from "mongoose";
import matchingModel from "@/models/matching.js";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { findGroupById } from "@/lib/activeGroup";
import User from "@/models/userModel.js";
import { groupSearchArea, findGroupCandidates, type Point } from "@/lib/groupGeo";
import { buildTasteQuery } from "@/lib/tasteQuery";

/* matching.js is untyped, so `group` is `any` and every field access would
   typecheck no matter how it was spelled. Naming the shape locally is the only
   thing standing between a typo and a 500. */
type Participant = {
    user: mongoose.Types.ObjectId;
    location?: { type: "Point"; coordinates: Point };
};

/* Ballot size. Long enough that the group has a real choice, short enough that
   everyone actually reads it — groupGeo's comments already assume ~7. */
const SHORTLIST_SIZE = 7;

/* The service is fast once warm but loads a sentence-transformer on its first
   request, so the ceiling is set by the cold start, not the search. */
const RECOMMENDER_TIMEOUT_MS = 20_000;

export async function POST(
    request: NextRequest,
    context: RouteContext<'/api/user/matching/[groupId]/shortlist'>
) {
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

        const { groupId } = await context.params;
        if (!mongoose.isValidObjectId(groupId)) {
            return NextResponse.json({ error: "Invalid group id" }, { status: 400 });
        }

        /* Raw, not findGroupById: populating would replace participants.user
           with a summary that carries no preferences, and replace restaurants
           with documents we are about to overwrite anyway. */
        const group = await matchingModel.findById(groupId).lean();
        if (!group) {
            return NextResponse.json({ error: "Group not found" }, { status: 404 });
        }

        /* 403, not 404. Unlike the location route there is nothing to hide —
           the caller is a known participant, they simply are not the organiser.
           Starting the vote freezes the ballot for everyone. */
        const isAdmin = group.admins.some(
            (a: mongoose.Types.ObjectId) => a.toString() === user.id
        );
        if (!isAdmin) {
            return NextResponse.json(
                { error: "Only a group admin can start the vote" },
                { status: 403 }
            );
        }

        /* Fast-fail courtesy only. The real guarantee is the compare-and-set in
           the final update — everything between here and there takes long
           enough for a second admin to arrive. */
        if (group.status !== "open") {
            return NextResponse.json(
                { error: "This group's vote has already started" },
                { status: 409 }
            );
        }

        const participants: Participant[] = group.participants;

        /* The circle is anchored on the admin and only ever grows around them,
           so without their location there is no search to run at all. Note this
           is the admin's PARTICIPANT ENTRY — their authorisation was settled
           above; this is purely about where they are. */
        const adminEntry = participants.find((p) => p.user.toString() === user.id);
        const adminPoint = adminEntry?.location?.coordinates;
        if (!adminPoint) {
            return NextResponse.json(
                { error: "Open the group once with location enabled — the search is centred on you." },
                { status: 400 }
            );
        }

        /* Its own array, in a fixed order, because groupSearchArea reports
           excludedMembers as INDICES INTO IT rather than as user ids. `?? null`
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
           boundary for every group read that ships to the browser. This one
           never leaves the server. */
        const participantIds = participants.map((p) => p.user);
        const users = await User.find({ _id: { $in: participantIds } })
            .select("preferences firstName lastName")
            .lean();

        /* Keyed, not indexed: find() gives no ordering guarantee, so position
           here does not correspond to position in `participants`. Used in the
           response to name members excluded for distance. */
        const prefsByUser = new Map(users.map((u: any) => [u._id.toString(), u]));

        /* Union across every member: one person's exclusion disqualifies the
           restaurant for the whole group. Unlike the taste aggregation this is
           not a tunable — it is least-misery applied to what people will not
           eat.

           `allergines` is deliberately NOT folded in. It is free text compared
           against cuisine names, so "peanuts" cannot match "Thai Restaurant";
           including it would look like allergen safety while doing nothing.
           The UI has to say plainly that allergens are not checked. */
        const excluded = new Set(
            users
                .flatMap((u: any) => u.preferences?.disliked ?? [])
                .map((s: string) => s.trim().toLowerCase())
                .filter(Boolean)
        );

        /* Whole-word matching, not exact-string. Foursquare stores categories
           as "Sushi Restaurant" / "Pizza Place" while `disliked` holds whatever
           the client sent — in practice a bare "sushi" — so exact equality,
           which nearby/route.ts and search/route.ts both use, almost never
           fires. Words rather than substrings so a disliked "bar" does not also
           take out every barbecue place.

           Stricter here than in the browsing routes on purpose: an unwanted
           restaurant in a scrollable list is an annoyance, the same restaurant
           on a frozen ballot is someone's dinner. */
        function isExcluded(cuisines: string[] | undefined): boolean {
            for (const c of cuisines ?? []) {
                const lower = c.toLowerCase();
                if (excluded.has(lower)) return true;
                for (const word of lower.split(/[^a-z0-9]+/)) {
                    if (word && excluded.has(word)) return true;
                }
            }
            return false;
        }

        const allowed = excluded.size > 0
            ? candidates.filter((r: any) => !isExcluded(r.cuisine))
            : candidates;

        /* Distinct from the 404 above. "Nothing nearby" and "nothing nearby
           that everyone will eat" are different problems with different fixes —
           widen the radius versus revisit someone's dislikes — and one message
           for both leaves the group unable to tell which they have. */
        if (allowed.length === 0) {
            return NextResponse.json(
                {
                    error: `Nothing within ${Math.round(area.radiusKm)}km that everyone in the group will eat.`,
                    radiusKm: area.radiusKm,
                },
                { status: 404 }
            );
        }

        /* Two arrays kept in step. /recommend/group returns memberSims in
           member order, so without the ids there is no way to say whose taste
           a pick reflects.

           Members with no stated taste are SKIPPED, not given a generic
           sentence: a neutral phrase sits near the corpus centre, and the
           service z-scores each member's row before aggregating — which would
           promote that noise to a full-strength vote and, since blend is half
           least-misery, let it set the minimum. */
        const queries: string[] = [];
        const memberIds: string[] = [];
        for (const u of users as any[]) {
            const query = buildTasteQuery(u.preferences ?? null);
            if (query !== null) {
                queries.push(query);
                memberIds.push(u._id.toString());
            }
        }
        const skippedMembers = participants.length - memberIds.length;

        if (queries.length === 0) {
            return NextResponse.json(
                { error: "Nobody in this group has set their food preferences yet." },
                { status: 400 }
            );
        }
        /* RESTAURANT ids, not member ids. The two arrays are both lists of
           strings, so swapping them typechecks perfectly and the service would
           answer 404 ("none of the candidateIds are in the index") — a failure
           that reads like a stale index rather than a wiring mistake. */
        const candidateIds = allowed.map((r: any) => r.fsqId);

        const RECOMMENDER_URL = process.env.RECOMMENDER_URL ?? "http://localhost:8000";

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
            /* 503 and NO shortlist — deliberately the opposite of what
               nearby/route.ts does when this same service is down. A degraded
               browsing list is something the user scrolls past; a degraded
               shortlist is seven restaurants picked by proximity, frozen into a
               ballot, presented as though taste shaped it. Nobody can tell it
               happened. When the failure is invisible and the artefact is
               permanent, fail loudly. */
            console.error("Group recommend unreachable:", err?.message ?? err);
            return NextResponse.json(
                { error: "The recommender is unavailable — the vote was not started." },
                { status: 503 }
            );
        }

        /* The service speaks fsqIds; matching.restaurants holds ObjectIds. The
           map is built from `allowed`, which is where candidateIds came from,
           so every returned id resolves — .filter(Boolean) is there so a
           mismatch drops that entry instead of writing an undefined into the
           ballot. */
        const idByFsqId = new Map<string, mongoose.Types.ObjectId>(
            allowed.map((r: any) => [r.fsqId, r._id])
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

        /* Compare-and-set. `status: "open"` belongs in the FILTER, not in an
           if-statement: since the check near the top of this handler we have
           run a geo query, a user lookup and a network round trip, which is
           ample time for a second admin to run the same route. Both would pass
           an early check; here, the first write flips the status and the
           loser's filter matches nothing.

           Rebuilding a ballot mid-vote would also wedge the group — the
           pre("save") hook rejects approvals that are no longer in
           restaurants[], so the document could never be saved again. */
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

        /* excludedMembers are INDICES into `others`, so they are resolved back
           through that array and then through prefsByUser — never by position
           in `users`, which find() returns in arbitrary order. */
        const excludedMembers = area.excludedMembers.map((i) => {
            const id = others[i].user.toString();
            const u: any = prefsByUser.get(id);
            return { userId: id, firstName: u?.firstName ?? null };
        });

        return NextResponse.json({
            message: "Shortlist created",
            success: true,
            group: await findGroupById(groupId),
            /* What the client cannot derive from the group document. `agreement`
               is the mean pairwise cosine between members — a low value is
               exactly when the UI should say these are compromises rather than
               favourites. */
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
}
