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

const photoSchema = new mongoose.Schema(
  {
    fsqPhotoId: String,
    // Build a usable URL with: prefix + "<size>" + suffix  (e.g. prefix + "300x300" + suffix)
    prefix: String,
    suffix: String,
    width: Number,
    height: Number,
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

const hoursSchema = new mongoose.Schema(
  {
    displayHours: [String], // human-readable, e.g. "Mon-Fri 9:00 AM-10:00 PM"
    openNow: Boolean,
    regular: [
      {
        day: Number, // 1 = Monday ... 7 = Sunday
        open: String, // "0900"
        close: String, // "2200"
      },
    ],
  },
  { _id: false }
);

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
    description: String,

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

    // Ratings & popularity
    rating: Number, // 0 - 10
    popularity: Number, // 0 - 1
    price: Number, // 1 ($) - 4 ($$$$)
    stats: {
      totalPhotos: Number,
      totalRatings: Number,
      totalTips: Number,
    },

    // Hours
    hours: hoursSchema,

    // Rich content
    photos: [photoSchema],
    tips: [tipSchema],
    tastes: [String], // crowd tags, e.g. "good for groups", "great cocktails"
    features: mongoose.Schema.Types.Mixed, // deeply nested amenities object — kept flexible
    menuUrl: String,

    verified: Boolean,
    dateClosed: String,

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
