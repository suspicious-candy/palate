import mongoose from "mongoose";

const friendshipSchema = new mongoose.Schema({

    userA : {
        type: mongoose.Schema.Types.ObjectId,ref: "users",
        required:true,
    },
    userB : {
        type: mongoose.Schema.Types.ObjectId,ref: "users",
        required:true
    },
    requestedBy:{
        type:String,
        required:true,
        enum:["a","b"]
    },
    status:{
        type:String,
        required:true,
        default:"pending",
        enum:["pending","accepted"]
    }

},{ timestamps: true });

friendshipSchema.pre("validate", function (next) {
    if (!this.userA || !this.userB) return next();

    const a = this.userA.toString();
    const b = this.userB.toString();

    if (a === b) {
        return next(new Error("A user cannot be friends with themselves"));
    }

    if (a > b) {
        const first = this.userA;
        this.userA = this.userB;
        this.userB = first;
        this.requestedBy = this.requestedBy === "a" ? "b" : "a";
    }

    next();
});

friendshipSchema.index({ userA: 1, userB: 1 }, { unique: true });
friendshipSchema.index({ userB: 1, status: 1 });

const friendship = mongoose.models.friendship || mongoose.model("friendship", friendshipSchema);
export default friendship;