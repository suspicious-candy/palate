import {connect} from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js"
import { NextRequest, NextResponse } from "next/server";
import {getUserFromToken} from "@/lib/auth"
import { z } from "zod";
import {friends, InvalidFriendshipError, type FriendOutcome,listFriends,listPending} from "@/lib/friends";

const argSchema = z.object({
    username: z.string().min(3),
});


const OUTCOME_MESSAGES: Record<FriendOutcome, string> = {
    created: "Friend request sent",
    accepted: "Friend request accepted",
    already_requested: "Friend request already sent",
    already_friends: "You are already friends",
};

export async function  POST(request: NextRequest) {

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
        const requesterId = user.id;

        const reqBody = await request.json();

        const result = argSchema.safeParse(reqBody);
        if (!result.success) {
            return NextResponse.json(
                { error: result.error.flatten().fieldErrors },
                { status: 400  }
            );
        }
        const target = await User.findOne({username:result.data.username});
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

}

export async function  GET(request: NextRequest) {

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

}

