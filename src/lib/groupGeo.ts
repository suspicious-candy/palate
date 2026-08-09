import Restaurant from "@/models/restaurantModel.js";

/* Where should a group's restaurant search be centred, and how wide?

   The rule: anchor on the admin (the person organising). If every other
   participant is within BASE_RADIUS_KM of them, use exactly that — the common
   case is friends who live near each other, and a fixed radius keeps the
   shortlist predictable. Only when someone falls outside does the circle grow,
   to their distance plus BUFFER_KM so there is somewhere to eat near them too.

   Note the asymmetry this accepts: the circle always grows around the ADMIN,
   never re-centres. A member 40km east gets a 45km circle centred on the admin,
   which includes plenty of restaurants 45km *west* of them. Step 3 chose
   least-misery for taste (maximise the worst-off member's satisfaction); the
   consistent extension would be least-misery for travel — minimise the farthest
   member's trip, which means anchoring nearer the middle. Worth revisiting once
   groups are real; admin-anchored is the simpler, more predictable start. */

export const BASE_RADIUS_KM = 30;
export const BUFFER_KM = 5;

/* A participant travelling in another city would otherwise inflate the radius
   without limit, and since Mongo returns the nearest N *to the admin*, their
   local restaurants would not make the cut anyway — the group would just get a
   worse shortlist for everyone. Past this they are dropped from the geometry
   and reported, so the UI can say so rather than silently ignoring them. */
export const MAX_RADIUS_KM = 100;

/* Chroma's candidate filter builds one predicate per id (MAX_CANDIDATES=500 in
   service.py), so the pool is capped here too. `$near` returns nearest-first,
   making this a sane truncation rather than an arbitrary one. */
export const MAX_CANDIDATES = 500;

/** GeoJSON order: [longitude, latitude]. Matches restaurants.geo.coordinates. */
export type Point = [number, number];

export type SearchArea = {
    center: Point;
    radiusKm: number;
    /** Distance to the farthest included member, 0 for a solo group. */
    farthestKm: number;
    /** Indices of members past MAX_RADIUS_KM, excluded from the geometry. */
    excludedMembers: number[];
};

export function haversineKm(a: Point, b: Point): number {
    const R = 6371;
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    // Destructure in GeoJSON order so the lng/lat swap can't happen silently.
    const [lngA, latA] = a;
    const [lngB, latB] = b;

    const dLat = toRad(latB - latA);
    const dLng = toRad(lngB - lngA);

    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;

    return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Size the search circle for a group.
 *
 * @param admin   the organiser's location — always the centre
 * @param members every other participant's location; `null` for anyone who
 *                hasn't opened the group yet, and simply skipped
 */
export function groupSearchArea(admin: Point, members: (Point | null)[]): SearchArea {
    const excludedMembers: number[] = [];
    let farthestKm = 0;

    members.forEach((m, i) => {
        if (!m) return;
        const d = haversineKm(admin, m);
        if (d > MAX_RADIUS_KM) {
            excludedMembers.push(i);
            return;
        }
        if (d > farthestKm) farthestKm = d;
    });

    return {
        center: admin,
        radiusKm: farthestKm <= BASE_RADIUS_KM ? BASE_RADIUS_KM : farthestKm + BUFFER_KM,
        farthestKm,
        excludedMembers,
    };
}

/**
 * The restaurants a group could actually go to, nearest first.
 *
 * Restricted to `source: "foursquare"` because only those are in places_v2 —
 * a shortlist entry with no vector cannot be taste-ranked, and for a list of
 * ~7 that is worse than omitting it. This differs on purpose from
 * /api/Restaurants/nearby, where ranking must reorder the geo results without
 * dropping any of them.
 */
export async function findGroupCandidates(area: SearchArea, limit = MAX_CANDIDATES) {
    return Restaurant.find({
        source: "foursquare",
        geo: {
            $near: {
                $geometry: { type: "Point", coordinates: area.center },
                $maxDistance: area.radiusKm * 1000, // $maxDistance is metres
            },
        },
    })
        .limit(limit)
        .lean();
}
