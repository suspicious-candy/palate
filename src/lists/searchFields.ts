// Foursquare Pro fields plus `rating` (Premium, kept intentionally). Other
// Premium fields (price, popularity, hours, photos, tastes, description,
// features) are omitted to keep requests lean.
export const SEARCH_FIELDS = [
  "fsq_place_id",
  "name",
  "categories",
  "location",
  "latitude",
  "longitude",
  "tel",
  "website",
  "rating",
].join(",");
