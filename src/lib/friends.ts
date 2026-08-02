import friendship from "@/models/friendshipModel.js";
import User from "@/models/userModel.js";

/* Expected, caller-caused failures. Routes map this to a 400 so it is never
   confused with a genuine server fault. */
export class InvalidFriendshipError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidFriendshipError";
    }
}

export type FriendOutcome =
    | "created"
    | "accepted"
    | "already_requested"
    | "already_friends";

export type FriendResult = {
    outcome: FriendOutcome;
    friendship: any;
}

export async function friends(requesterId: string,targetId: string,intent: "pending" | "accepted" = "pending"): Promise<FriendResult>{
    
    if(requesterId===targetId){
        throw new InvalidFriendshipError("A user cannot be friends with themselves");
    }

    const requesterIsA = requesterId < targetId;
    const userA = requesterIsA ? requesterId : targetId;
    const userB = requesterIsA ? targetId : requesterId;
    const initiator = requesterIsA ? "a" : "b";

    const existing = await friendship.findOne({ userA, userB });

    if(!existing){
        try{

            const created = await friendship.create({
                userA,
                userB,
                requestedBy:initiator,
                status:intent,
            }); return{outcome:"created",friendship:created}
        }catch(error:any){
            if (error?.code !== 11000) throw error;
            const raced = await friendship.findOne({ userA, userB });
            if (!raced) throw error;
            return resolveExisting(raced, initiator, userA, userB);
        }
        
    }else{
        return resolveExisting(existing, initiator, userA, userB);
    }

}

async function resolveExisting(
    existing: any,
    initiator: "a" | "b",
    userA: string,
    userB: string
): Promise<FriendResult> {
    if(existing.status==="accepted"){
        return { outcome: "already_friends", friendship: existing };
    }
    if (existing.requestedBy === initiator) {
        return { outcome: "already_requested", friendship: existing };
    }
    const accepted = await friendship.findOneAndUpdate(
        { userA, userB, status: "pending" },
        { $set: { status: "accepted" } },
        { new: true }
    );

    return accepted
        ? { outcome: "accepted", friendship: accepted }
        : { outcome: "already_friends", friendship: existing };
}

export async function listFriends(requesterId: string){

        const confirmedFriends = await friendship.find({
            status:"accepted",
             $or:[{userA:requesterId},
                {userB:requesterId}],
        }).lean();

        const confirmed = confirmedFriends.map((f) =>
            f.userA.toString() === requesterId ? f.userB : f.userA
        );

        const confirmedIdsData = await User.find({_id:{$in:confirmed}}).select({ username: 1, firstName: 1, lastName: 1, profilePic: 1 }).lean();
        return (confirmedIdsData);

}

export async function listPending(requesterId: string){

    try{

        const pendingFriends = await friendship.find({
            status:"pending",
             $or:[{ userA: requesterId, requestedBy: "b" }, 
                { userB: requesterId, requestedBy: "a" }],
        }).lean();
        
        const pending = pendingFriends.map((f) =>
            f.userA.toString() === requesterId ? f.userB : f.userA
        );

        const pendingIdsData = await User.find({_id:{$in:pending}}).select({ username: 1, firstName: 1, lastName: 1, profilePic: 1 }).lean();
        return (pendingIdsData);
    }
    catch(error:any){
        throw new Error (error.message);
    }

}