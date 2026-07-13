import { connect } from "@/dbConfig/dbConfig";
import Restaurant from "@/models/restaurantModel";
import { searchPlaces } from "@/lib/foursquare";
import { mapPlaceToResturant } from "@/lib/foursquareMap";
import type { FsqPlace } from "@/lib/foursquare";



export async function syncArea(opts: { ll?: string; near?: string; categories?: string }) {

  await connect();

  const { results } = await searchPlaces({ ...opts, limit: 50, sort: "RELEVANCE" });

  const ops = results.map((p: FsqPlace) => {
    const doc = mapPlaceToResturant(p);
    return {
      updateOne: {
        filter: { fsqId: doc.fsqId },
        update: { $set: doc },
        upsert: true,
      },
    };
  });

  if (ops.length) await Restaurant.bulkWrite(ops);

  return ops.length;
}
