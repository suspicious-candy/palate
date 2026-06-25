import {connect} from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js"
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { success, z } from "zod";

connect();

export const prefSchema = z.object({
  likedCuisines: [z.object({
    fsqid:z.number(),
    name:z.string(),
  })],
  disliked: [z.string()],
  allergines: [z.string()],
  diet:[z.string()],
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }  ) {
    
    try{

        await connect();

         const { id } = await params;   
        const reqBody = await request.json();

        const result = prefSchema.safeParse(reqBody);
        if (!result.success) {
        return NextResponse.json(
            { error: result.error.flatten().fieldErrors },
            { status: 400 }
        );
        }
        const { likedCuisines, disliked, allergines } = result.data;

        console.log(reqBody);

        const updateUser = await User.findByIdAndUpdate(
            id,
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