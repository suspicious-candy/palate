import Restaurant from "@/models/restaurantModel.js";
import { haversineKm, type Point } from "@/lib/distance";

/* Re-exported rather than redefined. The dashboard needs haversine without
   dragging the Restaurant model into the client bundle, so the math lives in
   lib/distance.ts; re-exporting keeps existing importers of this module
   working. */
export { haversineKm };
export type { Point };

/* Where a group's restaurant search is centred, and how wide it goes.

   The rule: anchor on the admin, the person organising. If every other
   participant is within BASE_RADIUS_KM of them, use exactly that — the common
   case is friends who live near each other, and a fixed radius keeps the
   shortlist predictable. The circle grows only when someone falls outside, to
   their distance plus BUFFER_KM so there is somewhere to eat near them too.

   This accepts a known asymmetry: the circle always grows around the admin and
   never re-centres. A member 40km east gets a 45km circle centred on the admin,
   which includes plenty of restaurants 45km west of them. Taste ranking uses
   least-misery, maximising the worst-off member's satisfaction; the consistent
   extension would be least-misery for travel too, minimising the farthest
   member's trip, which means anchoring nearer the middle. Admin-anchored is the
   simpler and more predictable start, and is worth revisiting once groups see
   real use. */

export const BASE_RADIUS_KM = 30;
export const BUFFER_KM = 5;

/* A participant travelling in another city would otherwise inflate the radius
   without limit, and since Mongo returns the nearest N to the admin, their
   local restaurants would not make the cut anyway — the group would just get a
   worse shortlist for everyone. Past this they are dropped from the geometry
   and reported, so the UI can say so rather than ignoring them silently. */
export const MAX_RADIUS_KM = 100;

/* Chroma's candidate filter builds one predicate per id (MAX_CANDIDATES=500 in
   service.py), so the pool is capped here to match. `$near` returns
   nearest-first, which makes this a sane truncation rather than an arbitrary
   one. */
export const MAX_CANDIDATES = 500;

export type SearchArea = {
    center: Point;
    radiusKm: number;
    /** Distance to the farthest included member, 0 for a solo group. */
    farthestKm: number;
    /** Indices of members past MAX_RADIUS_KM, excluded from the geometry. */
    excludedMembers: number[];
};

/**
 * Sizes the search circle for a group.
 *
 * @param admin   the organiser's location, always the centre
 * @param members every other participant's location; `null` for anyone who has
 *                not opened the group yet, and skipped
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
 * Restricted to `source: "foursquare"` because only those rows are in places_v2.
 * A shortlist entry with no vector cannot be taste-ranked, and in a list of
 * around seven that is worse than omitting it. This differs on purpose from
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
