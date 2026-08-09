// One-time seed: load the Yelp-derived restaurant catalog exported by
// restarunt-Rec/export_seed.py into MongoDB, upserting by fsqId (which here
// holds the Yelp business_id, not a real Foursquare id — see the README
// note this script's PR adds for why the field is reused as-is).
//
// Run:  npm run seed:restaurants

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MongoClient } from "mongodb";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.join(__dirname, "data", "restaurants.seed.json");

async function main() {
  if (!process.env.mongo_url) {
    throw new Error(
      "mongo_url is not set. Run via: npm run seed:restaurants (loads .env automatically)"
    );
  }

  const raw = await readFile(SEED_PATH, "utf-8");
  const restaurants = JSON.parse(raw);

  const client = new MongoClient(process.env.mongo_url);
  await client.connect();

  try {
    const collection = client.db().collection("restaurants");

    const now = new Date();
    const ops = restaurants.map((r) => ({
      updateOne: {
        filter: { fsqId: r.fsqId },
        update: {
          // Yelp rows carry review prose, not Foursquare categories, so they
          // are excluded from places_v2 and from the group shortlist. See the
          // `source` comment in src/models/restaurantModel.js.
          $set: { ...r, source: "yelp_seed", lastFetchedAt: now, updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    }));

    const result = await collection.bulkWrite(ops, { ordered: false });
    console.log(
      `Seeded ${restaurants.length} restaurants — ` +
        `${result.upsertedCount} inserted, ${result.modifiedCount} updated.`
    );

    await collection.createIndex({ "categories.name": 1 });
    await collection.createIndex({ geo: "2dsphere" });
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
