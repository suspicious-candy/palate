import { connect } from "@/dbConfig/dbConfig";
import Restaurant from "@/models/restaurantModel.js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod"
import { hit, clientKey, tooManyRequests, LIMITS } from "@/lib/rateLimit";
import { readCoords } from "@/lib/coords";

const radius = 70000;

export const argSchema = z.object({
    query:z.string(),
});

function escapeRegex(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request:NextRequest) {
    try{
        /* The only unauthenticated read endpoint, and not a cheap one: a regex
           scan plus a $near geo query, serializing up to 50 documents. */
        const verdict = await hit(`search:${clientKey(request)}`, LIMITS.search);
        if (!verdict.allowed) {
            return tooManyRequests(verdict.retryAfterSeconds, "Slow down a moment.");
        }

        await connect();

        const { searchParams } = new URL(request.url);

        /* No user lookup. This route read `preferences` only to apply the
           `disliked` exclusion, and with that field gone, name search returns the
           same answer for everybody and there is nothing to personalise. */
        const parsed = argSchema.safeParse({ query: searchParams.get("query") });

        if (!parsed.success) {
            return NextResponse.json({ error: "query is required" }, { status: 400 });
        }
        const searchText = parsed.data.query;

        /* Shared with the nearby route — see lib/coords.ts. The old
           Number.isNaN guard here passed a missing parameter straight through as
           0, and an out-of-range one straight into Mongo, which answered with a
           500 quoting the driver. */
        const coords = readCoords(searchParams);
        if (!coords) {
            return NextResponse.json(
                { error: "lat and lng are required, and must be valid coordinates" },
                { status: 400 }
            );
        }
        const { lat, lng } = coords;

        const pinnedRest = await Restaurant.find(
            { name: { $regex: escapeRegex(searchText), $options: "i" },
            geo: {
                $near: {
                    $geometry: { type: "Point", coordinates: [lng, lat] },
                    $maxDistance: radius,
                },
            },
        })
        .limit(50)
        .lean();

        return NextResponse.json({ restaurants: pinnedRest, count: pinnedRest.length });

    }catch(error:any){
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}