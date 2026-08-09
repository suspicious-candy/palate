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
  },
  { _id: false }
);

// NOTE: We keep `rating` and `tips` (reviews). Other Premium Foursquare fields
// (price, popularity, hours, photos, tastes, description, features) are
// intentionally not stored to keep requests lean.
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
    // NOTE: coordinates are [longitude, latitude] — lng first.
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

    dateClosed: String,

    /* Which importer wrote this row. Two of them share this collection and
       their text is not comparable — Yelp rows carry review prose, Foursquare
       rows carry categories — so they embed into different regions of the
       vector space and must never be ranked against each other. places_v2 and
       findGroupCandidates both select on `source: "foursquare"`.

       Originally inferred from field presence and stamped once by
       restarunt-Rec/backfill_source.py. Declared here because Mongoose runs
       strict: true and silently DROPS undeclared paths on write — without this
       line, every restaurant the nearby route syncs from Foursquare is written
       with no source, which makes it invisible to the group shortlist and to
       rebuild_index.py alike. Nothing errors; the row just never appears. */
    source: {
      type: String,
      enum: ["foursquare", "yelp_seed"],
      index: true,
    },

    // When you last synced this record from Foursquare
    lastFetchedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true } // adds createdAt / updatedAt
);

// 2dsphere index enables "restaurants near me" queries via $near / $geoWithin.
restaurantSchema.index({ geo: "2dsphere" });

const Restaurant =
  mongoose.models.restaurants ||
  mongoose.model("restaurants", restaurantSchema);

export default Restaurant;
