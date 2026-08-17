import User from "@/models/userModel.js"
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { z } from "zod";

export const argSchema = z.object({
    listName:z.string(),
});

export const PATCH = withAuth(async (request, user) => {

    try{

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

});

export const DELETE = withAuth(async (request, user) => {
     try{

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
});