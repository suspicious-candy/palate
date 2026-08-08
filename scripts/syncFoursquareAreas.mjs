// One-off bulk seed: search Foursquare around every US/India city above
// MIN_POPULATION (from a GeoNames city dump) and load results into MongoDB
// + the recommender's Chroma store, instead of waiting for real users to
// trigger nearby/route.ts one location at a time.
//
// Requires data/cities15000.txt (GeoNames cities15000 dump, tab-separated).
// Run:  npm run seed:foursquare

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MongoClient } from "mongodb";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RADIUS_METERS = 20000; // same radius nearby/route.ts uses
const DELAY_MS = 400; // be polite to Foursquare's rate limit
const MIN_POPULATION = Number(process.env.MIN_POPULATION ?? 100_000);
const DRY_RUN = process.env.DRY_RUN === "1";

async function loadCities() {
  const raw = await readFile(path.join(__dirname, "data", "cities15000.txt"), "utf-8");
  const cities = [];

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    // GeoNames columns: 1=name, 4=lat, 5=lng, 8=country code, 14=population
    const [, name, , , lat, lng, , , countryCode, , , , , , population] = cols;

    if (!["US", "IN"].includes(countryCode)) continue;
    if (Number(population) < MIN_POPULATION) continue;

    cities.push({ name, lat: Number(lat), lng: Number(lng), population: Number(population) });
  }

  return cities.sort((a, b) => b.population - a.population);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function searchFoursquare(lat, lng) {
  const url = `https://places-api.foursquare.com/places/search?ll=${lat},${lng}&radius=${RADIUS_METERS}&limit=50&query=restaurant`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.FOURSQUARE_API_KEY}`,
      "X-Places-Api-Version": process.env.FOURSQUARE_API_VERSION,
      accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Foursquare search failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.results;
}

function mapPlace(place) {
  return {
    fsqId: place.fsq_place_id,
    name: place.name,
    categories: place.categories.map((c) => ({
      fsqCategoryId: c.fsq_category_id,
      name: c.name,
      icon: c.icon ? { prefix: c.icon.prefix, suffix: c.icon.suffix } : undefined,
    })),
    cuisine: place.categories.map((c) => c.name),
    location: {
      formattedAddress: place.location.formatted_address,
      address: place.location.address,
      locality: place.location.locality,
      region: place.location.region,
      postcode: place.location.postcode,
      country: place.location.country,
    },
    geocodes: { latitude: place.latitude, longitude: place.longitude },
    geo: { type: "Point", coordinates: [place.longitude, place.latitude] },
    tel: place.tel,
    website: place.website,
    lastFetchedAt: new Date(),
  };
}

async function main() {
  const cities = await loadCities();
  console.log(`Loaded ${cities.length} cities (US + IN, population >= ${MIN_POPULATION})`);

  if (DRY_RUN) {
    console.log("DRY_RUN=1 set — not calling Foursquare. Sample:");
    console.log(cities.slice(0, 10).map((c) => `${c.name} (${c.population.toLocaleString()})`).join("\n"));
    return;
  }

  if (!process.env.mongo_url) throw new Error("mongo_url is not set. Run via: npm run seed:foursquare");

  const client = new MongoClient(process.env.mongo_url);
  await client.connect();
  const collection = client.db().collection("restaurants");

  let totalUpserted = 0;

  try {
    for (const city of cities) {
      let places;
      try {
        places = await searchFoursquare(city.lat, city.lng);
      } catch (err) {
        console.error(`[${city.name}] search failed:`, err.message);
        continue;
      }

      const mapped = places.map(mapPlace);
      const now = new Date();
      const ops = mapped.map((r) => ({
        updateOne: {
          filter: { fsqId: r.fsqId },
          update: { $set: r, $setOnInsert: { createdAt: now } },
          upsert: true,
        },
      }));

      const result = ops.length
        ? await collection.bulkWrite(ops, { ordered: false })
        : { upsertedCount: 0, modifiedCount: 0 };
      totalUpserted += result.upsertedCount;
      console.log(`[${city.name}] ${mapped.length} found, ${result.upsertedCount} new, ${result.modifiedCount} updated`);

      await sleep(DELAY_MS);
    }
  } finally {
    await client.close();
  }

  console.log(`\nDone. ${totalUpserted} new restaurants upserted.`);
  // This script writes Mongo only. The vector index has a single writer,
  // restarunt-Rec/rebuild_index.py, so new rows stay unindexed until it runs.
  console.log(
    "Next: cd ../restarunt-Rec && ./.venv/Scripts/python.exe rebuild_index.py --only-missing"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
