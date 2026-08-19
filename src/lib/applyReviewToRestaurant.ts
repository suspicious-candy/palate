import mongoose from "mongoose";
import { connect } from "@/dbConfig/dbConfig";
import Restaurant from "@/models/restaurantModel.js";
import Review from "@/models/reviewModel.js";
import { indexMissing } from "@/lib/recommender";

/* reviewModel.js is JavaScript, so Mongoose hands it back as `any` and every
   field access would typecheck however it was spelled. Naming the shape locally
   is what stands between a typo and a silent no-op, the same reason
   shortlist/route.ts declares its own Participant. Only the fields this function
   touches are listed. */
type ReviewDoc = {
    _id: mongoose.Types.ObjectId;
    restaurant: mongoose.Types.ObjectId;
    text?: string;
    createdAt?: Date;
};

/**
 * Folds one review into the restaurant document it belongs to.
 *
 * Everything written here is derived. The reviews collection is the source of
 * truth and both halves below can be rebuilt from it at any time, which is why
 * the caller treats a failure as non-fatal: a review that saved but did not
 * enrich is recoverable, whereas failing the request would tell the user their
 * review was lost while the unique {user, reservation} index refuses the retry.
 */
export async function applyReviewToRestaurant(review: ReviewDoc): Promise<void> {
    await connect();

    const text = review.text?.trim();

    /* Stars-only reviews are the common case and add nothing to the embedded
       text. Pushing "" would lengthen build_text's "What people say:" sentence
       without adding meaning. */
    if (text) {
        /* A conditional push rather than $addToSet. $addToSet dedupes on
           whole-document equality, and two pushes of the same review differ by
           createdAt, so both would land: it looks like the right operator and
           does nothing.

           The precondition lives in the filter instead. If a tip carrying this
           review's id is already there, nothing matches and the update is a
           no-op. That is atomic, so a retry or a double submit cannot both win —
           the same shape as `reservation: null` in the group booking route and
           `status: "open"` in the shortlist route.

           .toString() on both sides because fsqTipId is typed String; the field's
           type wins over the usual "ObjectIds toward Mongo" rule. */
        /* findOneAndUpdate rather than updateOne, purely to learn the fsqId.
           The recommender speaks fsqIds, and this is the only moment the document
           is in hand. Null when the filter matched nothing, which means the tip
           was already there and the re-embed below already happened. */
        const enriched = await Restaurant.findOneAndUpdate(
            {
                _id: review.restaurant,
                "tips.fsqTipId": { $ne: review._id.toString() },
            },
            {
                $push: {
                    tips: {
                        fsqTipId: review._id.toString(),
                        text,
                        createdAt: (review.createdAt ?? new Date()).toISOString(),
                        source: "palate",
                    },
                },
            },
            { new: true, projection: { fsqId: 1, source: 1 } }
        ).lean<{ fsqId?: string; source?: string } | null>();

        /* Only Foursquare rows are in places_v2. index/missing selects on
           source, so a yelp_seed row would cost a round trip just to be told
           requested: 0. Their tips still accumulate in Mongo for the next full
           rebuild_index.py run.

           force: true because the row is already indexed; without it the endpoint
           filters it out as "not missing" and the new text never reaches the
           vector.

           Not awaited, for the same reason nearby/route.ts gives for its own call
           to this endpoint: nothing later in the request depends on it, the user
           is waiting on a modal, and a vector that is a second stale is
           invisible. .catch() so a failure logs rather than becoming an unhandled
           rejection. */
        if (enriched?.fsqId && enriched.source === "foursquare") {
            indexMissing([enriched.fsqId], { force: true });
        }
    }

    /* Unconditional, because a stars-only review still moves the average.

       Recomputed, never incremented. `avg = (avg*count + r)/(count+1)` is one
       fewer query and a read-modify-write race: two concurrent reviews both read
       the old count and one of them is lost. Recomputing is idempotent, so
       running it twice is harmless, and it is self-healing — if an earlier
       enrichment failed, the next review repairs the number. The set is small and
       {restaurant: 1, createdAt: -1} serves the $match directly. */
    const [stats] = await Review.aggregate([
        { $match: { restaurant: review.restaurant } },
        { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);

    await Restaurant.updateOne(
        { _id: review.restaurant },
        {
            $set: {
                palateRating: {
                    avg: stats?.avg ?? null,
                    count: stats?.count ?? 0,
                },
            },
        }
    );
}
