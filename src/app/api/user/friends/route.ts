import User from "@/models/userModel.js"
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { z } from "zod";
import {friends, InvalidFriendshipError, type FriendOutcome,listFriends,listPending,removePendingRequest} from "@/lib/friends";

const argSchema = z.object({
    identifier: z.string().min(3),
});


const OUTCOME_MESSAGES: Record<FriendOutcome, string> = {
    created: "Friend request sent",
    accepted: "Friend request accepted",
    already_requested: "Friend request already sent",
    already_friends: "You are already friends",
    rejected: "Friend request declined",
    cancelled: "Friend request cancelled",
    nothing_to_remove: "No pending request with this user",
};

export const POST = withAuth(async (request, user) => {

    try{

        const requesterId = user.id;

        const reqBody = await request.json();

        const result = argSchema.safeParse(reqBody);
        if (!result.success) {
            return NextResponse.json(
                { error: result.error.flatten().fieldErrors },
                { status: 400  }
            );
        }
        const target = await User.findOne({
            $or: [
                { username: result.data.identifier },
                { email: result.data.identifier },
            ],
        });
        if (!target) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        const {outcome} = await friends(requesterId,target._id.toString());
        return NextResponse.json({
            message: OUTCOME_MESSAGES[outcome],
            success: true,
            outcome,
        });

    }

    catch(error:any){
        if (error instanceof InvalidFriendshipError) {
            return NextResponse.json({error: error.message}, {status:400});
        }
        return NextResponse.json({error: error.message},
            {status:500}
        )
    }

});

export const GET = withAuth(async (request, user) => {

    try{

        const requesterId = user.id;

        const [confirmed, pending] = await Promise.all([
            listFriends(requesterId),
            listPending(requesterId),
        ]);

        return NextResponse.json({ confirmed, pending, success: true });

    }

    catch(error:any){
        if (error instanceof InvalidFriendshipError) {
            return NextResponse.json({error: error.message}, {status:400});
        }
        return NextResponse.json({error: error.message},
            {status:500}
        )
    }

});

export const DELETE = withAuth(async (request, user) => {

    try{

        const requesterId = user.id;

        // safeParse takes `unknown`, so a bare string here would fail validation
        // at runtime with no compiler warning. argSchema wants an object.
        const identifier = request.nextUrl.searchParams.get("identifier");

        const result = argSchema.safeParse({ identifier });
        if (!result.success) {
            return NextResponse.json(
                { error: result.error.flatten().fieldErrors },
                { status: 400  }
            );
        }
        const target = await User.findOne({
            $or: [
                { username: result.data.identifier },
                { email: result.data.identifier },
            ],
        });
        if (!target) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        const {outcome} = await removePendingRequest(requesterId,target._id.toString());
        return NextResponse.json({
            message: OUTCOME_MESSAGES[outcome],
            success: true,
            outcome,
        });

    }

    catch(error:any){
        if (error instanceof InvalidFriendshipError) {
            return NextResponse.json({error: error.message}, {status:400});
        }
        return NextResponse.json({error: error.message},
            {status:500}
        )
    }

});