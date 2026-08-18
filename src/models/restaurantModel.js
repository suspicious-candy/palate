import mongoose from "mongoose";


const categorySchema = new mongoose.Schema(
  {
    fsqCategoryId: String,
    name: String, // e.g. "Italian Restaurant"
    icon: {
      prefix: String,
      suffix: String,
    },
  },
  { _id: false }
);

const tipSchema = new mongoose.Schema(
  {
    fsqTipId: String,
    text: String,
    createdAt: String,
    /* Which side wrote this tip. Foursquare tips and Palate post-meal reviews
       share one array and are otherwise indistinguishable, so nothing could
       recompute one without clobbering the other. `type` is not optional here:
       a bare { enum: [...] } is read as a nested object and silently creates a
       path called `source.enum` instead. */
    source: { type: String, enum: ["foursquare", "palate"] },
  },
  { _id: false }
);

// `rating` and `tips` (reviews) are kept. The other Premium Foursquare fields —
// price, popularity, hours, photos, tastes, description, features — are not
// stored, to keep requests lean.
const restaurantSchema = new mongoose.Schema(
  {
    fsqId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
    },

    avg:{type:Number},
    count:{type:Number},

    categories: [categorySchema],
    cuisine: [String], // optional flattened convenience field

    // Location
    location: {
      formattedAddress: String,
      address: String,
      locality: String, // city
      region: String, // state
      postcode: String,
      country: String,
      neighborhood: [String],
    },
    geocodes: {
      latitude: { type: Number },
      longitude: { type: Number },
    },
    // GeoJSON point for MongoDB geo queries ($near / $geoWithin).
    // Coordinates are [longitude, latitude] — lng first.
    geo: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number] }, // [lng, lat]
    },

    // Contact
    tel: String,
    email: String,
    website: String,
    socialMedia: {
      facebookId: String,
      instagram: String,
      twitter: String,
    },

    // Ratings & reviews (kept from Premium tier)
    rating: Number, // 0 - 10
    tips: [tipSchema],

    /* Palate's own diners, kept apart from `rating` above rather than blended
       into it. That field holds the Yelp or Foursquare score and build_text
       turns it into "Has a good rating"; mixing Palate stars in would destroy
       the provenance, and the two come from different populations anyway.

       Left on the raw 1-5 star scale, deliberately unlike `rating`'s 0-10. The
       mismatch is the reminder that averaging the two would be meaningless.
       Recomputed from the reviews collection on every write, never incremented. */
    palateRating: {
      avg: Number,
      count: { type: Number, default: 0 },
    },

    dateClosed: String,

    /* Which importer wrote this row. Two of them share this collection and their
       text is not comparable — Yelp rows carry review prose, Foursquare rows
       carry categories — so they embed into different regions of the vector
       space and must never be ranked against each other. places_v2 and
       findGroupCandidates both select on `source: "foursquare"`.

       Originally inferred from field presence and stamped once by
       restarunt-Rec/backfill_source.py. Declared here because Mongoose runs
       strict: true and silently drops undeclared paths on write. Without this
       line, every restaurant the nearby route syncs from Foursquare is written
       with no source, which makes it invisible to the group shortlist and to
       rebuild_index.py alike. Nothing errors; the row simply never appears. */
    source: {
      type: String,
      enum: ["foursquare", "yelp_seed"],
      index: true,
    },

    // When this record was last synced from Foursquare.
    lastFetchedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true } // adds createdAt / updatedAt
);

// The 2dsphere index is what enables "restaurants near me" via $near/$geoWithin.
restaurantSchema.index({ geo: "2dsphere" });

const Restaurant =
  mongoose.models.restaurants ||
  mongoose.model("restaurants", restaurantSchema);

export default Restaurant;
