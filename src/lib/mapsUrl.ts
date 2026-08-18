import type { Restaurant } from "@/lib/userContext";

/* Hoisted out of dashboard/page.tsx, which is a page rather than a module other
   screens should import from. The group page links the winner and every
   shortlist row to Maps, so both screens need it. */

/** A Google Maps search link for a restaurant.
 *
 * Prefers the formatted address, because a name plus an address resolves to the
 * right branch of a chain where bare coordinates land on a pin with no name.
 * Falls back to coordinates for rows that have no address. */
export function googleMapsUrl(r: Restaurant): string {
    const query = r.location?.formattedAddress
        ? `${r.name} ${r.location.formattedAddress}`
        : `${r.geocodes.latitude},${r.geocodes.longitude}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
