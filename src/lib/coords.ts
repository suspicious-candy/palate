import { z } from "zod";

/* One coordinate parser, shared by /api/Restaurants/nearby and
   /api/Restaurants/search — the same one-definition-two-consumers reasoning as
   protectedRoutes.ts and listName.ts. Both routes had the identical pair of
   holes, which is what a duplicated four-line parser buys you.

   HOLE ONE — Number(null) is 0, not NaN.

   Both routes read `Number(searchParams.get("lat"))` and then guarded with
   Number.isNaN. A missing parameter returns null, Number(null) is 0, and the
   guard never fires. A request with no coordinates at all searched (0, 0) —
   open ocean in the Gulf of Guinea — found nothing nearby, and in nearby's case
   fell through to the live Foursquare API and wrote whatever came back into the
   restaurants collection. Seven junk rows per call, from an endpoint with no
   auth and no rate limit.

   Number("") is 0 as well, so an empty parameter had the same effect.

   HOLE TWO — no range check.

   Mongo throws on an out-of-bounds point ("Longitude/latitude is out of
   bounds"), which the routes' catch reported as a 500 quoting the driver. A
   latitude of 91 is a bad request, not a server fault.

   z.coerce.number() does NOT save you from the empty string. It calls Number()
   underneath, and Number("") is 0 — the same trap as Number(null), one layer
   down. `?lat=&lng=` therefore validated as the coordinate (0, 0) and searched
   the ocean again, which is exactly the bug this module was written to close.
   So the blank check below is explicit and comes first; coercion runs only on
   something that actually has content.

   .finite() closes off "Infinity", which Number() parses happily and which is
   neither NaN nor caught by a min/max comparison.

   .transform(Number) rather than z.coerce.number(): coerce declares its input as
   `unknown`, so it cannot be piped from a string schema without a cast.
   Transforming keeps the chain honestly typed, string -> number. */
const degrees = (min: number, max: number) =>
    z
        .string()
        .trim()
        .min(1)
        .transform(Number)
        .pipe(z.number().finite().min(min).max(max));

export const coordSchema = z.object({
    lat: degrees(-90, 90),
    lng: degrees(-180, 180),
});

export type Coords = z.infer<typeof coordSchema>;

/** Parse `lat` and `lng` off a query string.

    Returns the parsed pair, or null when either is missing or out of range.
    Callers answer 400; there is no useful partial result. */
export function readCoords(searchParams: URLSearchParams): Coords | null {
    /* .get() returns null for an absent key, and z.coerce.number()(null) is 0 —
       coercion would resurrect exactly the bug this module exists to close. So
       absence is checked before coercion, not by it. */
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    if (lat === null || lng === null) return null;

    const parsed = coordSchema.safeParse({ lat, lng });
    return parsed.success ? parsed.data : null;
}

/* A coarse grid cell, used as a rate-limit key for the Foursquare sync.

   Two decimal places is roughly a 1.1 km square at the equator, narrowing as
   latitude rises. That is well inside the 20 km search radius, so every request
   from one neighbourhood shares a cell and a cold area is synced once rather
   than once per caller. Rounding rather than truncating so the cell is
   symmetric about the point instead of biased south-west.

   toFixed, not a multiply-round-divide, because floating point makes the latter
   produce "-0" and long tails like 42.360000000000004 for some inputs — both of
   which would silently split one cell into several keys. */
export function geoCell({ lat, lng }: Coords): string {
    return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}
