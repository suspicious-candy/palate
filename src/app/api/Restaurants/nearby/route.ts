import { connect } from "@/dbConfig/dbConfig";
import Restaurant from "@/models/restaurantModel.js";
import { NextRequest, NextResponse } from "next/server";
import { searchFoursquarePlaces, mapFoursquarePlace } from "@/lib/foursquare";

const radius = 20000;

export async function GET(request:NextRequest) {
    try{
        await connect();

        const { searchParams } = new URL(request.url);
        const lat = Number(searchParams.get("lat"));
        const lng = Number(searchParams.get("lng"));

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
        .limit(20)
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

            restaurants = mapped;
        }

        return NextResponse.json({ restaurants, count: restaurants.length });

    }catch(error:any){
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}