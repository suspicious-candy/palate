import User from "@/models/userModel.js"
import "@/models/restaurantModel.js";
import "@/models/reservationModel.js";
import "@/models/addressModel.js";
import { NextResponse } from "next/server";
import { closeVote } from "@/lib/closeVote";
import { withAuth } from "@/lib/withAuth";
import { findActiveGroup,findGroupById } from "@/lib/activeGroup";

export const GET = withAuth(async (request, user) => {

    try{

        const userId = user.id;

        /* The token fields are excluded alongside the password because they are
           the same kind of secret: anyone holding verifyToken can verify the
           account, and forgotPasswordToken can reset it. "-password" alone was
           shipping both to the browser on every dashboard load, where they sit in
           memory and in any logged network response.

           isVerified is still included, deliberately: the profile page reads it
           to show the badge and the resend button. */
        const authUser = await User.findById(userId)
            .select(
                "-password -verifyToken -verifyTokenExpiry " +
                "-forgotPasswordToken -forgotPasswordTokenExpiry"
            )
            .populate("wishlist")
            // `lists` is a Map of name -> [restaurant refs], and `$*` is
            // mongoose's wildcard for map values. Without it the page receives
            // raw ObjectIds.
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
        /* A second query rather than a populate, because membership lives in the
           matching collection rather than on a pointer here. It is cheap, hitting
           the participants.user index, and it is the price of never having two
           documents that can disagree about who is in a group. */
        let group = await findActiveGroup(userId);
        if(group!=null){
            try{
                const closeResult = await closeVote(group);
                    if(closeResult==="closed"){
                    group = await findGroupById(group._id);
                }}catch(error:any){
                    console.error("cant find the closed group");
                }
        }

        const response = NextResponse.json({
                message: "Dashboard fetch successful",
                success: true,
                // toObject() so the group can be attached. The model has no
                // virtuals or custom toJSON, so this serializes identically.
                user: { ...authUser.toObject(), matchingGroup: group },
        })

        return response;



    }catch(error:any){
        return NextResponse.json({
            message:error.message,
        },{status:500})
    }

});