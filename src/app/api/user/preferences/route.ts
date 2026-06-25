import {connect} from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js"
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

connect();

export const prefSchema = z.object({
  likedCuisines: z.array(z.object({
    fsqid: z.number(),
    name: z.string(),
  })).default([]),
  disliked: z.array(z.string()).default([]),
  allergines: z.array(z.string()).default([]),
  diet: z.array(z.string()).default([]),
});

export async function PATCH(request: NextRequest) {

    try{

        await connect();

        const reqBody = await request.json();
        const { userId } = reqBody;

        if (!userId) {
            return NextResponse.json(
                { error: "Missing userId" },
                { status: 400 }
            );
        }

        // z.object() strips unknown keys, so userId is dropped from result.data.
        const result = prefSchema.safeParse(reqBody);
        if (!result.success) {
        return NextResponse.json(
            { error: result.error.flatten().fieldErrors },
            { status: 400 }
        );
        }

        const updateUser = await User.findByIdAndUpdate(
            userId,
            { $set: { preferences: result.data } },
            { new: true, runValidators: true }
        ).select("-password");

        if(!updateUser){
            return NextResponse.json(
                {error : "User not found"},
                {status:404}
            )
        }
         return NextResponse.json({ success: true, user: updateUser });
    }

    catch(error:any){
        return NextResponse.json({error: error.message},
            {status:500}
        )
    }

}