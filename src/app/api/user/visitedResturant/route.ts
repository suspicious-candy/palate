import User from "@/models/userModel.js"
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { z } from "zod";
import Restaurant from "@/models/restaurantModel.js";
import { markVisited } from "@/lib/visited";

export const argSchema = z.object({
    fsqId:z.string()
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
        const rest = await Restaurant.findOne({ fsqId: result.data.fsqId });
        if (!rest) {
            return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
        }

         await markVisited(userId,[rest._id]);

         return NextResponse.json({ success: true});
    }

    catch(error:any){
        return NextResponse.json({error: error.message},
            {status:500}
        )
    }

});

