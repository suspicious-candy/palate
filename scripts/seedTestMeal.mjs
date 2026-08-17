// Create a past-dated reservation so the post-meal review flow has something
// to fire on, without hand-booking through the UI.
//
// Run:  npm run seed:testmeal -- <username|email> [fsqId]
//
// Leaves status "confirmed" on purpose — completeDueReservations is what should
// retire it, and watching that happen is half the test.

import { MongoClient } from "mongodb";

function need(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is not set. Run via: npm run seed:testmeal -- <username>`);
  }
  return process.env[name];
}

async function main() {
  const [identifier, fsqId] = process.argv.slice(2);
  if (!identifier) {
    throw new Error("Usage: npm run seed:testmeal -- <username|email> [fsqId]");
  }

  const client = new MongoClient(need("mongo_url"));
  await client.connect();

  try {
    const db = client.db();

    const user = await db.collection("users").findOne(
      { $or: [{ username: identifier }, { email: identifier }] },
      { projection: { username: 1 } }
    );
    if (!user) throw new Error(`No user matching "${identifier}"`);

    /* Prefer a foursquare row: places_v2 excludes yelp_seed, so only these
       exercise the re-embed half of the pipeline. Falls back to anything. */
    const restaurant =
      (fsqId
        ? await db.collection("restaurants").findOne({ fsqId })
        : await db.collection("restaurants").findOne({ source: "foursquare" })) ??
      (await db.collection("restaurants").findOne({}));

    if (!restaurant) throw new Error("No restaurants in the database — run npm run seed:restaurants");

    const date = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const { insertedId } = await db.collection("reservations").insertOne({
      users: [user._id],
      restaurant: restaurant._id,
      date,
      partySize: 2,
      status: "confirmed",
      notes: "Test meal (seedTestMeal.mjs)",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.collection("users").updateOne(
      { _id: user._id },
      { $addToSet: { reservations: insertedId } }
    );

    console.log(`\nBooked  ${restaurant.name}`);
    console.log(`  for           ${user.username}`);
    console.log(`  at            ${date.toLocaleString()}  (2h ago)`);
    console.log(`  source        ${restaurant.source ?? "(unset)"}${
      restaurant.source === "foursquare" ? "" : "  <- re-embed will be skipped"
    }`);
    console.log(`  reservation   ${insertedId}`);
    console.log(`\nNext: log in as ${user.username}, open /reservation (that GET retires it),`);
    console.log(`then reload any page — the review prompt should appear.\n`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
