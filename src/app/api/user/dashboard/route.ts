import {connect} from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js"
import "@/models/restaurantModel.js";
import "@/models/reservationModel.js";
import "@/models/addressModel.js";
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import {getUserFromToken} from "@/lib/auth"
import { z } from "zod";
import { findActiveGroup } from "@/lib/activeGroup";

export async function GET(request: NextRequest) {

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

        const authUser = await User.findById(userId)
            .select("-password")
            .populate("wishlist")
            // `lists` is a Map of name -> [restaurant refs]; `$*` is mongoose's
            // wildcard for map VALUES. Without it the page receives raw ObjectIds.
            .populate("lists.$*")
            .populate("visitedResturants")
            .populate("savedAddresses")
            .populate({ path: "reservations",        populate: { path: "restaurant" } })
            .populate({ path: "reservationHistory",  populate: { path: "restaurant" } })
        if(!authUser){
                return NextResponse.json(
                    {error:"Invalid credentials"},{status:401}
                );
        }
        /* A second query rather than a populate: membership lives in the
           matching collection, not on a pointer here. Cheap — it hits the
           participants.user index — and it is the price of never having two
           documents that can disagree about who is in a group. */
        const group = await findActiveGroup(userId);

        const response = NextResponse.json({
                message: "Dashboard fetch successful",
                success: true,
                // toObject() so the group can be attached; the model has no
                // virtuals or custom toJSON, so this serializes identically.
                user: { ...authUser.toObject(), matchingGroup: group },
        })

        return response;



    }catch(error:any){
        return NextResponse.json({
            message:error.message,
        },{status:500})
    }

}