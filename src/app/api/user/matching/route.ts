import {connect} from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js"
import "@/models/restaurantModel.js";
import "@/models/matching.js";
import { NextRequest, NextResponse } from "next/server";
import {getUserFromToken} from "@/lib/auth"

/* The five fields FriendSummary declares. Populated subdocuments do NOT inherit
   the outer .select(), so without this every participant's password hash, email
   and phone would ship to the browser along with their avatar initials. */
const USER_SUMMARY = "username firstName lastName profilePic";

/* userModel is a .js file, so Mongoose hands the query back as `any` and a typo
   in the path below would compile fine and silently return null forever.
   Naming the shape this route reads gives the compiler something to check —
   same reason /api/Restaurants/nearby declares its own UserPreferences. */
type MatchingGroupSlot = {
    matchingGroup?: { group?: unknown } | null;
};

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

        const authUser: MatchingGroupSlot | null = await User.findById(userId)
            .select("matchingGroup")
            .populate({
                path: "matchingGroup.group",
                populate: [
                    { path: "participants.user", select: USER_SUMMARY },
                    { path: "participants.approvals" },
                    { path: "restaurants" },
                    { path: "winner" },
                    { path: "admins", select: USER_SUMMARY },
                ],
            }).lean();
        if(!authUser ){
                return NextResponse.json(
                    {error:"Invalid credentials"},{status:401}
                );
        }
        const response = NextResponse.json({
                message: "Group Fetch successful",
                success: true,
                group:authUser.matchingGroup?.group ?? null,
        })
        return response;

    }catch(error:any){
        return NextResponse.json({
            message:error.message,
        },{status:500})
    }

}