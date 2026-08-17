import User from "@/models/userModel.js"
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { z } from "zod";

export const prefSchema = z.object({
  likedCuisines: z.array(z.object({
    fsqid: z.number(),
    name: z.string(),
  })).default([]),
  allergines: z.array(z.string()).default([]),
  diet: z.array(z.string()).default([]),
});

export const PATCH = withAuth(async (request, user) => {

    try{

        const userId = user.id;

        const reqBody = await request.json();

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

});