import { connect } from "@/dbConfig/dbConfig";
import Restaurant from "@/models/restaurantModel.js";
import { NextRequest, NextResponse } from "next/server";
import { searchFoursquarePlaces, mapFoursquarePlace } from "@/lib/foursquare";
import { getUserFromToken } from "@/lib/auth";
import UserModel from "@/models/userModel.js";
import { buildTasteQuery, type UserPreferences } from "@/lib/tasteQuery";
import { loadLearnedCuisines } from "@/lib/tasteSignal";
import { readCoords, geoCell } from "@/lib/coords";
import { hit, clientKey, tooManyRequests, LIMITS } from "@/lib/rateLimit";
import { RECOMMENDER_URL, indexMissing } from "@/lib/recommender";

const radius = 20000;

/* How long to wait on the recommender before serving distance order instead.
   Three seconds is well above a warm response (measured at well under one) and
   well below a cold start, which is the distinction that matters — see the note
   at the call site. */
const NEARBY_RECOMMEND_TIMEOUT_MS = 3_000;

/* This route can run three paginated Foursquare requests, a bulk upsert and a
   recommender call in one invocation, which is comfortably past the platform's
   default function timeout on a cold area. Every one of those is already
   individually non-fatal, but only if the function lives long enough to reach
   the catch. */
export const maxDuration = 30;

export async function GET(request:NextRequest) {
    try{
        /* Before connect(), like the other rate-limited routes: the point is to
           refuse without paying for the refusal. */
        const verdict = await hit(`nearby:${clientKey(request)}`, LIMITS.nearby);
        if (!verdict.allowed) {
            return tooManyRequests(verdict.retryAfterSeconds, "Slow down a moment.");
        }

        await connect();


        const { searchParams } = new URL(request.url);

        /* Parsed up here, and the request is refused before any database work,
           rather than being validated halfway down after the user lookup. The
           old guard sat below the preferences read and used Number.isNaN, which
           a missing parameter never trips — see lib/coords.ts. */
        const coords = readCoords(searchParams);
        if (!coords) {
            return NextResponse.json(
                { error: "lat and lng are required, and must be valid coordinates" },
                { status: 400 }
            );
        }
        const { lat, lng } = coords;

        const token = request.cookies.get("token")?.value;
        const authPayload = getUserFromToken(token);
        const dbUser: { preferences?: UserPreferences } | null = authPayload
            ? await UserModel.findById(authPayload.id).select("preferences").lean()
            : null;

        const prefs = dbUser?.preferences;
        /* What the user has actually eaten and rated 4+, on top of what they said
           at onboarding. Only for a signed-in caller, since there is no anonymous
           history to read. */
        const learned = authPayload
            ? (await loadLearnedCuisines([authPayload.id])).get(authPayload.id) ?? []
            : [];
        /* Shared with the group shortlist route, so both rank a person by the
           same sentence. Two drifting definitions of "what this user's taste
           sounds like" would rank two users by different rules, and nothing would
           ever surface it. */
        const preferenceQuery = buildTasteQuery(prefs ?? null, learned);

        let restaurants = await Restaurant.find({
            geo: {
                $near: {
                    $geometry: { type: "Point", coordinates: [lng, lat] },
                    $maxDistance: radius,
                },
            },
        })
        .limit(50)
        .lean();
        /* TWO GATES ON THE SYNC, and they guard different things.

           Everything below this point spends money and writes to the restaurants
           collection: up to three pages of the Foursquare Places API, then an
           upsert of every place that comes back. The route above it is a plain
           read and stays open to anonymous callers, which is right — a signed-out
           visitor should still see restaurants near them.

           `authPayload` — a signed-in caller. Not an authorization decision so
           much as a cost one: an anonymous request cannot be attributed to
           anybody, and this is the only path in the app that bills a third party.
           A signed-out visitor in an unsynced area gets an empty list rather than
           a populated one, which is a real (small) product cost, and the
           alternative was an endpoint anyone could loop to run up the bill.

           `foursquareSync` — a per-area cooldown, keyed on a ~1km cell rather
           than on the caller. Being signed in is not by itself permission to
           re-sync the same square repeatedly, and ten neighbours in a genuinely
           new area should cost one sync between them rather than ten. See the
           note on the limit in rateLimit.ts.

           Both are checked before the call rather than after, so a refusal costs
           nothing. Neither returns an error: an unsynced area is an empty result,
           not a failure, and the caller has nothing to do about it either way. */
        /* THE SHORT-CIRCUIT IS LOAD-BEARING. hit() consumes budget as a side
           effect, so it must be the last operand: written in any other order, a
           signed-out visitor or an area that already has restaurants would spend
           the cell's one sync per hour without ever performing one, and the first
           real caller would be refused. `&&` still short-circuits across the
           await, so the call is only made when the first two hold.

           The parentheses around the await are not optional. `await hit(...)
           .allowed` reads .allowed off the Promise — undefined, therefore falsy,
           therefore the sync silently never runs and new areas stop being
           discovered with nothing in the logs to say so. */
        const maySync =
            restaurants.length === 0 &&
            !!authPayload &&
            (await hit(`fsqsync:${geoCell(coords)}`, LIMITS.foursquareSync)).allowed;

        if (maySync) {
            const places = await searchFoursquarePlaces(lat, lng, radius);
            const mapped = places.map(mapFoursquarePlace);

            await Restaurant.bulkWrite(
                mapped.map((r) => ({
                    updateOne: {
                        filter: { fsqId: r.fsqId },
                        update: { $set: r },
                        upsert: true,
                    },
                }))
            );

            restaurants = mapped;

            /* Still not /embed. Posting a locally built sentence created a second
               text template, one that kept the restaurant name and so embedded at
               74% category precision against the index's 95%. Only the ids are
               sent; the recommender reads the text from Mongo and runs the same
               build_text pipeline rebuild_index.py runs, so there is one template
               either way.

               Not awaited. A freshly synced restaurant has no vector until
               something embeds it, but that is invisible to this request:
               unscored candidates are appended in distance order below, so the
               user gets their list now and the vectors exist for the next call
               and, more to the point, for the group shortlist. */
            indexMissing(mapped.map((r) => r.fsqId));
        }

        const query = searchParams.get("query")?? preferenceQuery ?? "restaurant";
        const candidateIds = restaurants.map((r) => r.fsqId);

        let recommended = restaurants;
        try {
            /* Filter, then rank. An earlier version asked the recommender for its
               top 50 across the whole corpus and intersected that with the 50
               nearest: two independent draws from roughly 15k restaurants, which
               overlap in 0.16 items on average. Measured, the intersection was
               empty every time, so `ranked` was always empty and the ranking
               silently never applied. Sending the candidates instead makes the
               vector search order what the geo query already chose. */
            /* A SHORT timeout, and deliberately the opposite of the shortlist
               route's long one.

               The two routes want opposite things from a slow recommender. This
               one degrades invisibly and well: the catch below falls back to
               distance order, which is a perfectly good list. So waiting is the
               worst option — it makes a user stare at a spinner to get a result
               barely different from the one available immediately.

               The shortlist route cannot degrade, because it freezes a ballot
               that people then vote on, so it waits out a cold start instead.

               On a scale-to-zero host a cold instance takes tens of seconds to
               load its model. Without this, that latency landed on whoever
               opened the dashboard first. With it, they get their restaurants
               now, the request warms the instance in the background, and the
               ranking is there on the next load. */
            const recRes = await fetch(`${RECOMMENDER_URL}/recommend`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query, k: candidateIds.length, candidateIds }),
                signal: AbortSignal.timeout(NEARBY_RECOMMEND_TIMEOUT_MS),
            });

            if (recRes.ok) {
                const { businessIds } = await recRes.json();
                const byId = new Map(restaurants.map((r) => [r.fsqId, r]));

                const ranked = businessIds
                    .map((id: string) => byId.get(id))
                    .filter(Boolean);

                /* Not every nearby restaurant has a vector: the 5,444 yelp_seed
                   rows are not in places_v2. Ranking must reorder candidates and
                   never drop them, so anything unscored keeps its distance
                   ordering at the end of the list. */
                if (ranked.length > 0) {
                    const rankedIds = new Set(ranked.map((r: { fsqId: string }) => r.fsqId));
                    recommended = [
                        ...ranked,
                        ...restaurants.filter((r) => !rankedIds.has(r.fsqId)),
                    ];
                }
            }
        } catch (err) {
            console.error("Recommend call failed, falling back to nearby list:", err);
        }
        
        return NextResponse.json({ restaurants: recommended, count: recommended.length });

    }catch(error:any){
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}