import {connect} from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js"
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import {getUserFromToken} from "@/lib/auth"
import { z } from "zod";

connect();

export const prefSchema = z.object({
  likedCuisines: z.array(z.object({
    fsqid: z.number(),
    name: z.string(),
  })).default([]),
  allergines: z.array(z.string()).default([]),
  diet: z.array(z.string()).default([]),
});

export async function PATCH(request: NextRequest) {

    try{

        await connect();

        if (!process.env.TOKEN_SECRET) {
            return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
        }

        const token = request.cookies.get("token")?.value;
        const user = getUserFromToken(token);
        if (!user) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }
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

}