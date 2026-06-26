import {connect} from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js"
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
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

        if (!process.env.TOKEN_SECRET) {
            return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
        }

        // Identify the user from the verified JWT cookie, never from the body —
        // otherwise anyone could write preferences for any account.
        const token = request.cookies.get("token")?.value;
        if (!token) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        let userId: string;
        try {
            const decoded = jwt.verify(token, process.env.TOKEN_SECRET) as { id: string };
            userId = decoded.id;
        } catch {
            return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
        }

        const reqBody = await request.json();

        // z.object() strips unknown keys, so any stray fields are dropped.
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