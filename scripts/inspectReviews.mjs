// Read-only report on the post-meal review pipeline: what was written, and
// whether each derived side-effect landed.
//
// Run:  npm run inspect:reviews

import { MongoClient } from "mongodb";

function need(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is not set. Run via: npm run inspect:reviews (loads .env automatically)`);
  }
  return process.env[name];
}

async function main() {
  const client = new MongoClient(need("mongo_url"));
  await client.connect();

  try {
    const db = client.db();
    const reviews = db.collection("reviews");
    const restaurants = db.collection("restaurants");
    const users = db.collection("users");

    const total = await reviews.countDocuments();
    console.log(`\nreviews: ${total}`);

    if (total === 0) {
      console.log("\nNothing to inspect yet. Book a past-dated table with");
      console.log("  npm run seed:testmeal -- <username>");
      console.log("then load /reservation and submit a review.\n");
      return;
    }

    const latest = await reviews.find().sort({ createdAt: -1 }).limit(10).toArray();

    for (const rev of latest) {
      const rest = await restaurants.findOne(
        { _id: rev.restaurant },
        { projection: { name: 1, fsqId: 1, source: 1, tips: 1, palateRating: 1 } }
      );
      const user = await users.findOne({ _id: rev.user }, { projection: { username: 1 } });

      const tip = (rest?.tips ?? []).find((t) => t.fsqTipId === rev._id.toString());

      console.log("\n" + "-".repeat(64));
      console.log(`${"★".repeat(rev.rating)}${"☆".repeat(5 - rev.rating)}  ${rest?.name ?? "?"}`);
      console.log(`  by            ${user?.username ?? rev.user}`);
      console.log(`  text          ${rev.text ? JSON.stringify(rev.text.slice(0, 60)) : "(none)"}`);
      console.log(`  source        ${rest?.source ?? "(unset)"}`);
      console.log(`  fsqId         ${rest?.fsqId ?? "?"}`);

      // 5a, half one: the tip push. Absent is EXPECTED for a stars-only review.
      if (tip) {
        console.log(`  tip written   yes  (source: ${tip.source ?? "(unset)"})`);
      } else if (!rev.text?.trim()) {
        console.log(`  tip written   n/a  (stars only — nothing to add to build_text)`);
      } else {
        console.log(`  tip written   NO   <- enrichment did not run or failed`);
      }

      // 5a, half two: the aggregate. Recomputed, so count must equal the number
      // of reviews this restaurant actually has.
      const expected = await reviews.countDocuments({ restaurant: rev.restaurant });
      const pr = rest?.palateRating;
      const ok = pr && pr.count === expected;
      console.log(
        `  palateRating  ${pr ? `avg ${pr.avg?.toFixed(2)} over ${pr.count}` : "MISSING"}` +
          (pr ? (ok ? "  ok" : `  <- MISMATCH, ${expected} reviews exist`) : "")
      );

      // 5b only applies to rows places_v2 holds.
      if (rest?.source !== "foursquare") {
        console.log(`  vector        skipped (places_v2 is foursquare-only)`);
      } else {
        console.log(`  vector        check:  curl -s -X POST http://localhost:8000/index/missing \\`);
        console.log(`                          -H "Content-Type: application/json" \\`);
        console.log(`                          -d '{"businessIds":["${rest.fsqId}"],"force":true}'`);
      }
    }

    const withPalateTips = await restaurants.countDocuments({ "tips.source": "palate" });
    console.log("\n" + "-".repeat(64));
    console.log(`restaurants carrying a palate tip: ${withPalateTips}\n`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
