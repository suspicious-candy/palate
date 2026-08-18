import { connect } from "@/dbConfig/dbConfig";
import Restaurant from "@/models/restaurantModel.js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod"
import { hit, clientKey, tooManyRequests, LIMITS } from "@/lib/rateLimit";

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
        const verdict = hit(`search:${clientKey(request)}`, LIMITS.search);
        if (!verdict.allowed) {
            return tooManyRequests(verdict.retryAfterSeconds, "Slow down a moment.");
        }

        await connect();

        const { searchParams } = new URL(request.url);
        const lat = Number(searchParams.get("lat"));
        const lng = Number(searchParams.get("lng"));

        /* No user lookup. This route read `preferences` only to apply the
           `disliked` exclusion, and with that field gone, name search returns the
           same answer for everybody and there is nothing to personalise. */
        const parsed = argSchema.safeParse({ query: searchParams.get("query") });

        if (!parsed.success) {
            return NextResponse.json({ error: "query is required" }, { status: 400 });
        }
        const searchText = parsed.data.query;
        
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            return NextResponse.json({ error: "lat and lng query params are required" }, { status: 400 });
        }

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