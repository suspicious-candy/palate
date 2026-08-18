/* Great-circle distance, and nothing else.

   Split out of groupGeo.ts so the browser can use it. groupGeo imports the
   Mongoose model at module scope (findGroupCandidates queries it), and a
   `"use client"` component importing from there pulls mongoose into the client
   bundle. That constraint is why the dashboard grew its own private copy of
   haversine, and that copy was the one carrying the unit bug noted below. Pure
   math with no model import is the only version both sides can share. */

/** GeoJSON order: [longitude, latitude]. Matches restaurants.geo.coordinates. */
export type Point = [number, number];

const EARTH_RADIUS_KM = 6371;

/* Exact by definition: the international mile is 1609.344 m. Named because the
   dashboard rendered raw kilometres under a "mi" label for as long as the card
   existed, so every distance shown was about 1.6x short — the difference
   between "walkable" and "drive". */
const KM_PER_MILE = 1.609344;

export function haversineKm(a: Point, b: Point): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    // Destructured in GeoJSON order so the lng/lat swap cannot happen silently.
    const [lngA, latA] = a;
    const [lngB, latB] = b;

    const dLat = toRad(latB - latA);
    const dLng = toRad(lngB - lngA);

    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;

    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** The display unit. The seeded corpus is US data (Yelp `country: "US"`). */
export function haversineMiles(a: Point, b: Point): number {
    return haversineKm(a, b) / KM_PER_MILE;
}
