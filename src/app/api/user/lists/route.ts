import {connect} from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js"
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import {getUserFromToken} from "@/lib/auth"
import { z } from "zod";
import Restaurant from "@/models/restaurantModel.js";

connect();

export const argSchema = z.object({
    listName:z.string(),
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

        const result = argSchema.safeParse(reqBody);
        if (!result.success) {
            return NextResponse.json(
                { error: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }
        const existingUser = await User.findById(userId);
        if (!existingUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        if (existingUser.lists.has(result.data.listName)) {
            return NextResponse.json({ error: "List already exists" }, { status: 409 });
        }

        const updateUser = await User.findByIdAndUpdate(
            userId,
            { $set: { [`lists.${result.data.listName}`]: [] } },
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

        const result = argSchema.safeParse(reqBody);
        if (!result.success) {
        return NextResponse.json(
            { error: result.error.flatten().fieldErrors },
            { status: 400 }
        );
        }

        const updateUser = await User.findByIdAndUpdate(
            userId,
            { $unset: { [`lists.${result.data.listName}`]: "" } },
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