import User from "@/models/userModel.js"
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { z } from "zod";
import Restaurant from "@/models/restaurantModel.js";

export const argSchema = z.object({
    listName:z.string(),
    fsqId: z.string(),
    restName: z.string(),
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

        const rest = await Restaurant.findOne({ fsqId: result.data.fsqId });
        if (!rest) {
            return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
        }

        const updateUser = await User.findByIdAndUpdate(
            userId,
            { $addToSet: { [`lists.${result.data.listName}`]: rest._id } },
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

        const rest = await Restaurant.findOne({ fsqId: result.data.fsqId });
        if (!rest) {
            return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
        }

        const updateUser = await User.findByIdAndUpdate(
            userId,
            { $pull: { [`lists.${result.data.listName}`]: rest._id } },
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