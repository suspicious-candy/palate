import mongoose from "mongoose";

const reviewSchema =  new mongoose.Schema({
    user : {
        type: mongoose.Schema.Types.ObjectId,ref: "users",
        required:true,
    },
    /* Denormalised from the reservation so the enrichment and aggregate reads
       don't have to join. Safe because a booking's restaurant never changes —
       reservations/route.ts only ever mutates `status`. The route must read
       this OFF the reservation, never from the request body, or a client can
       review a restaurant it never had a table at. */
    restaurant:{
        type: mongoose.Schema.Types.ObjectId,ref: "restaurants",
        required:true,
    },
    reservation:{
        type: mongoose.Schema.Types.ObjectId,ref: "reservations",
        required:true,
    },
    /* 1-5 as the user typed it, NOT pre-scaled to the restaurant model's 0-10
       `rating` — the ×2 happens where the aggregate is computed, so this stays
       a checkable record of what a person actually said.

       Mongoose has no integer type: `type: Number` accepts 3.7 happily, so the
       whole-star rule needs a validator. */
    rating:{
        type:Number,
        min:1,
        max:5,
        required:true,
        validate:{
            validator: Number.isInteger,
            message: "rating must be a whole number of stars",
        },
    },
    text:{
        type:String,
        trim:true,
        maxlength:999,
        default: ""
    }
},{ timestamps: true });

/* One review per person per MEAL, enforced by the database rather than by a
   find-then-insert in the route — that check races (two tabs, one double-tapped
   button) and both inserts win. Here the second write fails with duplicate-key
   error 11000, which the route turns into a 409. Same reasoning as the
   compare-and-set filters in shortlist/route.ts and matching's reservation route.

   Keyed on `reservation`, deliberately not `restaurant`: going back to the same
   place twice is two meals and deserves two verdicts. "Loved it in March, hated
   it in July" is exactly the signal this feature exists to capture. */
reviewSchema.index({ user: 1, reservation: 1 }, { unique: true });

/* The taste signal: this user's recent verdicts, newest first. -1 matches the
   sort direction so the index serves it instead of an in-memory sort. Always
   recency-capped — a taste built from every review ever written is dominated by
   whatever they ate two years ago. */
reviewSchema.index({ user: 1, createdAt: -1 });

/* The enrichment side: everything said about this place. Serves both the copy
   into restaurant.tips and the palateRating aggregate. */
reviewSchema.index({ restaurant: 1, createdAt: -1 });

const reviews = mongoose.models.reviews || mongoose.model("reviews", reviewSchema);
export default reviews;