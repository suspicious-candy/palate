import {connect} from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js"
import { NextRequest, NextResponse } from "next/server";
import {getUserFromToken} from "@/lib/auth"
import { z } from "zod";
import Restaurant from "@/models/restaurantModel.js";
import { markVisited } from "@/lib/visited";

connect();

export const argSchema = z.object({
    fsqId:z.string()
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

}

