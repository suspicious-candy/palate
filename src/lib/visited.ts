import mongoose from "mongoose";
import { connect } from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js";

export async function markVisited(userId:string,restIds:mongoose.Types.ObjectId[]) {
    if(!restIds.length){return};
    await connect();
    await User.findByIdAndUpdate(userId,{
        $addToSet:{visitedResturants:{$each:restIds}},
    });
}