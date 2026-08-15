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

// 50 is the API's per-page maximum, not a preference.
const PAGE_SIZE = 50;

/* Pages per city, so up to MAX_PAGES * 50 restaurants each. This is the number
   that used to be an invisible 1, which is why every synced city held exactly
   50 places no matter its size — the ceiling was this constant, never geography.

   Ten is a starting point, not a law: raise it for dense metros, and note the
   budget. ~1,100 cities x 10 pages is ~11k requests against a 180k/day quota,
   and the burst limit is 150, which PAGE_DELAY_MS below stays well under. */
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 10);

// Between pages of the SAME city. Shorter than DELAY_MS because these are
// already serialized behind one city's loop.
const PAGE_DELAY_MS = 150;

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

/* Foursquare paginates by CURSOR: the response carries
     Link: <https://places-api.foursquare.com/places/search?…&cursor=c3I6NQ>; rel="next"
   and that URL already holds every original query parameter, so it is fetched
   verbatim. Rebuilding it by hand from ll/radius/cursor is how you end up
   paging through a subtly different search than you began with.

   Mirrors nextPageUrl() in src/lib/foursquare.ts. The duplication is the same
   one that already applies to mapPlace() below: this is a plain .mjs script and
   cannot import the app's TypeScript. */
function nextPageUrl(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel\s*=\s*"?next"?/i);
    if (match) return match[1];
  }
  return null;
}

/** @returns {Promise<{places: any[], pages: number, hitCap: boolean}>} */
async function searchFoursquare(lat, lng) {
  const headers = {
    Authorization: `Bearer ${process.env.FOURSQUARE_API_KEY}`,
    "X-Places-Api-Version": process.env.FOURSQUARE_API_VERSION,
    accept: "application/json",
  };

  let url = `https://places-api.foursquare.com/places/search?ll=${lat},${lng}&radius=${RADIUS_METERS}&limit=${PAGE_SIZE}&query=restaurant`;
  const places = [];
  let pages = 0;

  while (url && pages < MAX_PAGES) {
    const res = await fetch(url, { headers });

    if (!res.ok) {
      // Page 1 failing means this city produced nothing — let the caller's
      // catch log it and move on. A later page failing is not worth throwing
      // away the pages that did work.
      if (pages === 0) {
        throw new Error(`Foursquare search failed: ${res.status} ${await res.text()}`);
      }
      console.error(`  page ${pages + 1} failed (${res.status}); keeping ${places.length}`);
      break;
    }

    const data = await res.json();
    places.push(...(data.results ?? []));
    pages++;

    url = nextPageUrl(res.headers.get("link"));
    if (url && pages < MAX_PAGES) await sleep(PAGE_DELAY_MS);
  }

  // hitCap distinguishes "that is everything Foursquare has" from "we stopped
  // early" — without it a capped city is indistinguishable from an exhausted
  // one, which is exactly how the old limit=50 hid for so long.
  return { places, pages, hitCap: Boolean(url) && pages >= MAX_PAGES };
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
    // See restaurantModel.js — only source: "foursquare" rows get vectors.
    source: "foursquare",
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
  // Cities that still had a next-page cursor when MAX_PAGES ran out. Reported
  // at the end so a truncated run is never mistaken for a complete one.
  const cappedCities = [];

  try {
    for (const city of cities) {
      let found;
      try {
        found = await searchFoursquare(city.lat, city.lng);
      } catch (err) {
        console.error(`[${city.name}] search failed:`, err.message);
        continue;
      }

      const { places, pages, hitCap } = found;
      if (hitCap) cappedCities.push(city.name);

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
      console.log(
        `[${city.name}] ${mapped.length} found over ${pages} page${pages === 1 ? "" : "s"}` +
          `${hitCap ? " (CAPPED — more available)" : ""}, ` +
          `${result.upsertedCount} new, ${result.modifiedCount} updated`
      );

      await sleep(DELAY_MS);
    }
  } finally {
    await client.close();
  }

  console.log(`\nDone. ${totalUpserted} new restaurants upserted.`);

  /* Never let a bounded run look like an exhaustive one. This is the report the
     old code could not produce: with limit=50 and no paging, every city looked
     "complete" at exactly 50, and there was nothing to say otherwise. */
  if (cappedCities.length) {
    console.log(
      `\n${cappedCities.length} cit${cappedCities.length === 1 ? "y" : "ies"} hit the ` +
        `${MAX_PAGES}-page cap and have more available — re-run with a higher ` +
        `MAX_PAGES to go deeper:\n  ` +
        cappedCities.slice(0, 20).join(", ") +
        (cappedCities.length > 20 ? `, … (+${cappedCities.length - 20} more)` : "")
    );
  }
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
