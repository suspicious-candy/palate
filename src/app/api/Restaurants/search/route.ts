import { connect } from "@/dbConfig/dbConfig";
import Restaurant from "@/models/restaurantModel.js";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import UserModel from "@/models/userModel.js";
import { z } from "zod"

const radius = 70000;

export const argSchema = z.object({
    query:z.string(),
});

function escapeRegex(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request:NextRequest) {
    try{
        await connect();

        const { searchParams } = new URL(request.url);
        const lat = Number(searchParams.get("lat"));
        const lng = Number(searchParams.get("lng"));

        const token = request.cookies.get("token")?.value;
        const authPayload = getUserFromToken(token);
        const dbUser = authPayload ? await UserModel.findById(authPayload.id).select("preferences").lean(): null;

        const prefs = dbUser?.preferences;
        const parsed = argSchema.safeParse({ query: searchParams.get("query") });

        if (!parsed.success) {
            return NextResponse.json({ error: "query is required" }, { status: 400 });
        }
        const searchText = parsed.data.query;
        
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            return NextResponse.json({ error: "lat and lng query params are required" }, { status: 400 });
        }

        let pinnedRest = await Restaurant.find(
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

        
        const excluded = new Set([...(prefs?.disliked ?? [])].map((s) => s.toLowerCase()));
        if (excluded.size > 0) {
            pinnedRest = pinnedRest.filter((r) =>
                !r.cuisine?.some((c: string) => excluded.has(c.toLowerCase()))
            );
        }

        return NextResponse.json({ restaurants: pinnedRest, count: pinnedRest.length });

    }catch(error:any){
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}