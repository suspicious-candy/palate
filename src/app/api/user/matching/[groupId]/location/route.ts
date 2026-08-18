import mongoose from "mongoose";
import matchingModel from "@/models/matching.js";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { z } from "zod";
import { findGroupById } from "@/lib/activeGroup";

/* Named {lng, lat} rather than a positional pair. GeoJSON stores [lng, lat],
   which is the reverse of how the pair is usually said out loud, so the array is
   built from named fields in exactly one place, below, and never travels as
   one. */
export const patchSchema = z.object({
    coord:z.object({
        lng:z.number().min(-180).max(180),
        lat:z.number().min(-90).max(90)
    })
});

export const PATCH = withAuth(async (request, user, context: RouteContext<'/api/user/matching/[groupId]/location'>) => {
    try {
        const { groupId } = await context.params;
        if (!mongoose.isValidObjectId(groupId)) {
            return NextResponse.json({ error: "Invalid group id" }, { status: 400 });
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
        }

        const result = patchSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json(
                { error: result.error.flatten().fieldErrors },
                { status: 400  }
            );
        }

        const locUpdate = await matchingModel.updateOne({
            _id:groupId,
            "participants.user": user.id
        },{
            $set:{
                "participants.$.location":{
                    type:"Point",
                    coordinates:[result.data.coord.lng, result.data.coord.lat]
                },
                "participants.$.locationAt": new Date(),
            }
        })

        /* matchedCount, never modifiedCount. The filter requires the caller to be
           a participant, so zero matches means "no such group, or not yours" —
           deliberately one answer, so this cannot be used to probe which group
           ids exist. modifiedCount is 0 whenever someone reopens the group from
           the same spot, which is success rather than failure. */
        if(locUpdate.matchedCount===0){
            return NextResponse.json(
                { error: "No group with that id found" },
                { status: 404  }
            );
        }

        return NextResponse.json({
            message: "Location updated",
            success: true,
            group: await findGroupById(groupId),
        });
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
});