import mongoose from "mongoose";
import { connect } from "@/dbConfig/dbConfig";
import Review from "@/models/reviewModel.js";
import Restaurant from "@/models/restaurantModel.js";

/* What counts as "I liked it". 4+ on a 5-star scale, because only ATTRACTION
   can go into a taste query — see buildTasteQuery's comment on why a low rating
   cannot be expressed as text at all. A 3 is not evidence either way. */
const MIN_RATING = 4;

/* How many recent likes shape a person's taste. Uncapped, someone's taste would
   be whatever they ate two years ago; this is what the {user, createdAt: -1}
   index on reviewModel exists to serve. */
const RECENT_LIKES = 8;

/* How many learned cuisines reach the query. The cap is the whole point: a
   person with 8 reviews and 3 stated cuisines should not have the stated ones
   drowned out, and a long list of terms dilutes the sentence — every extra
   token pulls the vector further toward the centre of the corpus. */
const MAX_LEARNED = 3;

/**
 * Cuisines a person has actually gone out and rated highly, newest first.
 *
 * BATCH BY DESIGN. The group shortlist ranks every member, so a per-user
 * version would be a database round trip inside a loop; both callers go through
 * this one signature. Kept out of buildTasteQuery so that function stays pure
 * and synchronous — it is the single definition of "what this user's taste
 * sounds like" and two callers must not be able to drift apart on it.
 *
 * @returns userId (as a string) -> cuisine names, most-eaten first. Users with
 *   no qualifying reviews are simply absent from the map.
 */
export async function loadLearnedCuisines(
    userIds: string[]
): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (!userIds.length) return out;

    await connect();

    const ids = userIds.map((id) => new mongoose.Types.ObjectId(id));

    /* $sort BEFORE $group so $push accumulates in recency order — the per-user
       slice below depends on it. Done as one aggregation rather than a find()
       with a limit because a single flat limit is not per-user: one member with
       40 recent reviews would consume the whole allowance and leave the rest of
       the group with nothing. */
    const grouped: { _id: mongoose.Types.ObjectId; restaurants: mongoose.Types.ObjectId[] }[] =
        await Review.aggregate([
            { $match: { user: { $in: ids }, rating: { $gte: MIN_RATING } } },
            { $sort: { createdAt: -1 } },
            { $group: { _id: "$user", restaurants: { $push: "$restaurant" } } },
        ]);

    if (!grouped.length) return out;

    const perUser = grouped.map((g) => ({
        userId: g._id.toString(),
        restaurantIds: g.restaurants.slice(0, RECENT_LIKES),
    }));

    /* One query for every restaurant any member liked, not one per user — the
       same N+1 the pending-review route avoids. Duplicates across members cost
       nothing here and are resolved through the map below. */
    const wanted = [...new Set(perUser.flatMap((u) => u.restaurantIds.map((r) => r.toString())))];
    const restaurants: { _id: mongoose.Types.ObjectId; categories?: { name?: string }[] }[] =
        await Restaurant.find({ _id: { $in: wanted } })
            .select("categories")
            .lean();

    const categoriesById = new Map(
        restaurants.map((r) => [
            r._id.toString(),
            (r.categories ?? []).map((c) => c?.name).filter((n): n is string => !!n?.trim()),
        ])
    );

    for (const { userId, restaurantIds } of perUser) {
        /* Frequency, not presence: three Thai dinners should outrank one Italian
           when only MAX_LEARNED terms survive. Map preserves insertion order, so
           a tie falls back to recency — the first restaurant to contribute a
           category is the most recent one. */
        const counts = new Map<string, number>();
        for (const rid of restaurantIds) {
            for (const name of categoriesById.get(rid.toString()) ?? []) {
                counts.set(name, (counts.get(name) ?? 0) + 1);
            }
        }

        const top = [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, MAX_LEARNED)
            .map(([name]) => name);

        if (top.length) out.set(userId, top);
    }

    return out;
}
