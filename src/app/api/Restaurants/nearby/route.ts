import { connect } from "@/dbConfig/dbConfig";
import Restaurant from "@/models/restaurantModel.js";
import { NextRequest, NextResponse } from "next/server";
import { searchFoursquarePlaces, mapFoursquarePlace } from "@/lib/foursquare";
import { getUserFromToken } from "@/lib/auth";
import UserModel from "@/models/userModel.js";

const radius = 20000;

/* userModel is a .js file, so anything Mongoose returns here arrives as `any`.
   Annotating the query gives the preferences shape a real type instead. */
type UserPreferences = {
    likedCuisines?: { fsqid?: number; name: string }[];
    disliked?: string[];
    allergines?: string[];
    diet?: string[];
};

export async function GET(request:NextRequest) {
    try{
        await connect();
        
        const RECOMMENDER_URL = process.env.RECOMMENDER_URL ?? "http://localhost:8000";

        const { searchParams } = new URL(request.url);
        const lat = Number(searchParams.get("lat"));
        const lng = Number(searchParams.get("lng"));

        const token = request.cookies.get("token")?.value;
        const authPayload = getUserFromToken(token);
        const dbUser: { preferences?: UserPreferences } | null = authPayload
            ? await UserModel.findById(authPayload.id).select("preferences").lean()
            : null;

        const prefs = dbUser?.preferences;
        const preferenceQuery = prefs?.likedCuisines?.length
            ? `A ${[...prefs.likedCuisines.map((c) => c.name), ...(prefs.diet ?? [])].join(", ")} restaurant`
            : null;
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            return NextResponse.json({ error: "lat and lng query params are required" }, { status: 400 });
        }

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
        if (restaurants.length === 0) {
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

            /* Deliberately no /embed call. Mongo is the source of truth for the
               text; the vector index has exactly one writer, restarunt-Rec's
               rebuild_index.py, which builds from Mongo with a single template.
               Posting our own sentence here made a second writer with a second
               template — one that kept the restaurant NAME and so embedded at
               74% category precision against the index's 95%.

               These restaurants therefore have no vector until someone runs
               `rebuild_index.py --only-missing`. That degrades gracefully:
               unscored candidates are appended in distance order below. */

            restaurants = mapped;
        }

        const query = searchParams.get("query")?? preferenceQuery ?? "restaurant";
        const candidateIds = restaurants.map((r) => r.fsqId);

        let recommended = restaurants;
        try {
            /* Filter-then-rank. Previously this asked the recommender for its
               top 50 across the whole corpus and intersected that with the 50
               nearest — two independent draws from ~15k restaurants, which
               overlap in 0.16 items on average. Measured: the intersection was
               empty every time, so `ranked` was always empty and the ranking
               silently never applied. Sending the candidates instead makes the
               vector search order what the geo query already chose. */
            const recRes = await fetch(`${RECOMMENDER_URL}/recommend`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query, k: candidateIds.length, candidateIds }),
            });

            if (recRes.ok) {
                const { businessIds } = await recRes.json();
                const byId = new Map(restaurants.map((r) => [r.fsqId, r]));

                const ranked = businessIds
                    .map((id: string) => byId.get(id))
                    .filter(Boolean);

                /* Not every nearby restaurant has a vector — the 5,444
                   yelp_seed rows are not in places_v2. Ranking must reorder
                   candidates, never drop them, so anything unscored keeps its
                   distance ordering at the end of the list. */
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
        
        const excluded = new Set([...(prefs?.disliked ?? [])].map((s) => s.toLowerCase()));
        if (excluded.size > 0) {
            recommended = recommended.filter((r) =>
                !r.cuisine?.some((c: string) => excluded.has(c.toLowerCase()))
            );
        }
       // recommended = recommended.slice(0, 6);

        return NextResponse.json({ restaurants: recommended, count: recommended.length });

    }catch(error:any){
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}