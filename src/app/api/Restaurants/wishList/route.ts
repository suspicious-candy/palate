import {connect} from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js"
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import {getUserFromToken} from "@/lib/auth"
import { z } from "zod";
import Restaurant from "@/models/restaurantModel.js";

connect();
export const restSchema = z.object({
    fsqId: z.string(),
    name: z.string(),
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

        const result = restSchema.safeParse(reqBody);
        if (!result.success) {
        return NextResponse.json(
            { error: result.error.flatten().fieldErrors },
            { status: 400 }
        );
        }

        const rest = await Restaurant.findOne({ fsqId: result.data.fsqId });
        if (!rest) {
            return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
        }

        const updateUser = await User.findByIdAndUpdate(
            userId,
            { $addToSet: { wishlist: rest._id } },
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

export async function DELETE(request: NextRequest) {
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

        const result = restSchema.safeParse(reqBody);
        if (!result.success) {
        return NextResponse.json(
            { error: result.error.flatten().fieldErrors },
            { status: 400 }
        );
        }

        const rest = await Restaurant.findOne({ fsqId: result.data.fsqId });
        if (!rest) {
            return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
        }

        const updateUser = await User.findByIdAndUpdate(
            userId,
            { $pull: { wishlist: rest._id } },
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