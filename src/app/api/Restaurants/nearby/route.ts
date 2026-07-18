import { connect } from "@/dbConfig/dbConfig";
import Restaurant from "@/models/restaurantModel.js";
import { NextRequest, NextResponse } from "next/server";
import { searchFoursquarePlaces, mapFoursquarePlace } from "@/lib/foursquare";
import { getUserFromToken } from "@/lib/auth";
import UserModel from "@/models/userModel.js";

const radius = 20000;

export async function GET(request:NextRequest) {
    try{
        await connect();
        
        const RECOMMENDER_URL = process.env.RECOMMENDER_URL ?? "http://localhost:8000";

        const { searchParams } = new URL(request.url);
        const lat = Number(searchParams.get("lat"));
        const lng = Number(searchParams.get("lng"));

        const token = request.cookies.get("token")?.value;
        const authPayload = getUserFromToken(token);
        const dbUser = authPayload ? await UserModel.findById(authPayload.id).select("preferences").lean(): null;

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
            
            try {
                await fetch(`${RECOMMENDER_URL}/embed`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        places: mapped.map((r) => ({
                            businessId: r.fsqId,
                            text: `${r.name} is a ${r.cuisine.join(", ") || "restaurant"} located at ${r.location.formattedAddress ?? "an unknown address"}.`,
                        })),
                    }),
                });
            } catch (err) {
                console.error("Failed to embed newly-synced restaurants into the recommender:", err);
            }


            restaurants = mapped;
        }

        const query = searchParams.get("query")?? preferenceQuery ?? "restaurant";
        const nearbyIds = new Set(restaurants.map((r) => r.fsqId));

        let recommended = restaurants;
        try {
            const recRes = await fetch(`${RECOMMENDER_URL}/recommend`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query, k: 50 }),
            });

            if (recRes.ok) {
                const { businessIds } = await recRes.json();
                const byId = new Map(restaurants.map((r) => [r.fsqId, r]));

                const ranked = businessIds
                    .filter((id: string) => nearbyIds.has(id))
                    .map((id: string) => byId.get(id));

                if (ranked.length > 0) recommended = ranked;
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