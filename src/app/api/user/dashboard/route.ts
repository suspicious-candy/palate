import {connect} from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js"
// Imported for their side effect: populate() resolves refs by model NAME, so
// every schema referenced below must be registered on this mongoose instance
// before the query runs. Route modules load lazily, so we can't rely on some
// other route having imported them first.
import "@/models/restaurantModel.js";
import "@/models/reservationModel.js";
import "@/models/addressModel.js";
import "@/models/matching.js";
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import {getUserFromToken} from "@/lib/auth"
import { z } from "zod";



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
            .populate({
                path: "matchingGroup.group",
                populate: [
                    { path: "participants.user" },
                    { path: "participants.rankedVotes" },
                    { path: "restaurants" },
                    { path: "winner" },
                ],
            }).populate("wishlist")
            .populate("visitedResturants")
            .populate("savedAddresses")
            .populate({ path: "reservations",        populate: { path: "restaurant" } })
            .populate({ path: "reservationHistory",  populate: { path: "restaurant" } })
        if(!authUser){
                return NextResponse.json(
                    {error:"Invalid credentials"},{status:401}
                );
        }
        const getPref = authUser.preferences;
        const getwishlist=authUser.wishlist;
        const response = NextResponse.json({
                message: "Prefrence Fetch successful",
                success: true,
                user:authUser,
        })

        return response;



    }catch(error:any){
        return NextResponse.json({
            message:error.message,
        },{status:500})
    }

}