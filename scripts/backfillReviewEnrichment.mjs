// Rebuild every derived side-effect of the reviews collection: the tip on
// restaurant.tips[] and the palateRating aggregate.
//
// Run:  npm run fix:reviews
//
// This exists because POST /api/reviews treats enrichment failure as non-fatal
// — the review saves, the derived writes may not. That trade is only sound if
// the derived writes are genuinely rebuildable, which is what this proves.
// Safe to run repeatedly: every write below is idempotent.

import { MongoClient } from "mongodb";

function need(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is not set. Run via: npm run fix:reviews`);
  }
  return process.env[name];
}

async function main() {
  const client = new MongoClient(need("mongo_url"));
  await client.connect();

  try {
    const db = client.db();
    const reviews = await db.collection("reviews").find().sort({ createdAt: 1 }).toArray();
    const restaurants = db.collection("restaurants");

    if (!reviews.length) {
      console.log("\nNo reviews to backfill.\n");
      return;
    }

    let pushed = 0;
    let sourceFixed = 0;

    for (const rev of reviews) {
      const text = rev.text?.trim();
      if (!text) continue;

      const tipId = rev._id.toString();
      const rest = await restaurants.findOne(
        { _id: rev.restaurant },
        { projection: { tips: 1 } }
      );
      if (!rest) continue;

      const existing = (rest.tips ?? []).find((t) => t.fsqTipId === tipId);

      if (!existing) {
        await restaurants.updateOne(
          { _id: rev.restaurant, "tips.fsqTipId": { $ne: tipId } },
          {
            $push: {
              tips: {
                fsqTipId: tipId,
                text,
                createdAt: (rev.createdAt ?? new Date()).toISOString(),
                source: "palate",
              },
            },
          }
        );
        pushed++;
      } else if (!existing.source) {
        // Written while tipSchema declared `source` without a `type`, so
        // Mongoose's strict mode dropped it. The positional $ updates the one
        // array element the filter matched.
        await restaurants.updateOne(
          { _id: rev.restaurant, "tips.fsqTipId": tipId },
          { $set: { "tips.$.source": "palate" } }
        );
        sourceFixed++;
      }
    }

    // Recomputed per restaurant, exactly as applyReviewToRestaurant does it.
    const perRestaurant = await db
      .collection("reviews")
      .aggregate([
        { $group: { _id: "$restaurant", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
      ])
      .toArray();

    for (const r of perRestaurant) {
      await restaurants.updateOne(
        { _id: r._id },
        { $set: { palateRating: { avg: r.avg, count: r.count } } }
      );
    }

    console.log(`\nreviews scanned        ${reviews.length}`);
    console.log(`tips pushed            ${pushed}`);
    console.log(`tip source repaired    ${sourceFixed}`);
    console.log(`palateRating written   ${perRestaurant.length} restaurant(s)\n`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
