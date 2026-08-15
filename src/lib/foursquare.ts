const FOURSQUARE_BASE_URL = "https://places-api.foursquare.com/places/search";

/* 50 is the API's per-call maximum, not a choice. Getting more than 50 means
   more CALLS — which is what this file did not do until now, and why every
   synced area held exactly 50 restaurants regardless of how many were there. */
const PAGE_SIZE = 50;

/* How many pages the RUNTIME path will walk. Deliberately small: this runs
   inside a user's request to /api/Restaurants/nearby, and every page is a round
   trip they wait through. Three pages is ~150 places, comfortably more than the
   50 the geo query then selects from, without turning a cold-area first load
   into a five-second stall. The bulk seed script walks far deeper — it is
   offline and nobody is waiting. */
const RUNTIME_MAX_PAGES = 3;

type FoursquarePlace = {
    fsq_place_id: string;
    name: string;
    latitude: number;
    longitude: number;
    categories: {
        fsq_category_id: string;
        name: string;
        icon?: { prefix: string; suffix: string };
    }[];
    location: {
        address?: string;
        locality?: string;
        region?: string;
        postcode?: string;
        country?: string;
        formatted_address?: string;
    };
    tel?: string;
    website?: string;
    social_media?: {
        facebook_id?: string;
        instagram?: string;
        twitter?: string;
    };
};

/**
 * The next page's URL from a `Link` header, or null when this is the last page.
 *
 * Foursquare paginates by CURSOR, not by offset — the response carries
 *   Link: <https://places-api.foursquare.com/places/search?…&cursor=c3I6NQ>; rel="next"
 * and that URL already contains every original query parameter. So a caller
 * fetches it verbatim; rebuilding it from `ll`/`radius`/`cursor` by hand is how
 * you end up silently paging through a different search than you started.
 *
 * Returning null on a missing or unparseable header is what makes this safe:
 * the loop below simply stops, which is exactly the old single-page behaviour.
 */
function nextPageUrl(linkHeader: string | null): string | null {
    if (!linkHeader) return null;
    // A Link header may carry several comma-separated relations; we want `next`.
    for (const part of linkHeader.split(",")) {
        const match = part.match(/<([^>]+)>\s*;\s*rel\s*=\s*"?next"?/i);
        if (match) return match[1];
    }
    return null;
}

export async function searchFoursquarePlaces(
    latitude: number,
    longitude: number,
    radiusMeters: number,
    { maxPages = RUNTIME_MAX_PAGES }: { maxPages?: number } = {}
): Promise<FoursquarePlace[]> {
    const headers = {
        Authorization: `Bearer ${process.env.FOURSQUARE_API_KEY}`,
        "X-Places-Api-Version": process.env.FOURSQUARE_API_VERSION!,
        accept: "application/json",
    };

    let url: string | null =
        `${FOURSQUARE_BASE_URL}?ll=${latitude},${longitude}&radius=${radiusMeters}&limit=${PAGE_SIZE}&query=restaurant`;

    const places: FoursquarePlace[] = [];

    for (let page = 0; page < maxPages && url; page++) {
        const res: Response = await fetch(url, { headers });

        if (!res.ok) {
            /* A failure on page 1 is a real error — there is nothing to return.
               A failure on page 3 is not worth discarding two good pages over,
               so keep what we have. Callers upsert by fsqId, which makes a
               short result set merely incomplete rather than wrong. */
            if (page === 0) {
                throw new Error(
                    `Foursquare search failed: ${res.status} ${await res.text()}`
                );
            }
            console.error(
                `Foursquare page ${page + 1} failed (${res.status}); keeping ${places.length} places`
            );
            break;
        }

        const data = await res.json();
        places.push(...((data.results ?? []) as FoursquarePlace[]));

        url = nextPageUrl(res.headers.get("link"));
    }

    return places;
}

export function mapFoursquarePlace(place: FoursquarePlace) {
    return {
        fsqId: place.fsq_place_id,
        name: place.name,
        categories: place.categories.map((c) => ({
            fsqCategoryId: c.fsq_category_id,
            name: c.name,
            icon: c.icon ? { prefix: c.icon.prefix, suffix: c.icon.suffix } : undefined,
        })),
        cuisine: place.categories.map((c) => c.name),
        location: {
            formattedAddress: place.location.formatted_address,
            address: place.location.address,
            locality: place.location.locality,
            region: place.location.region,
            postcode: place.location.postcode,
            country: place.location.country,
        },
        geocodes: { latitude: place.latitude, longitude: place.longitude },
        geo: {
            type: "Point" as const,
            coordinates: [place.longitude, place.latitude], // GeoJSON: lng first
        },
        tel: place.tel,
        website: place.website,
        socialMedia: place.social_media
            ? {
                  facebookId: place.social_media.facebook_id,
                  instagram: place.social_media.instagram,
                  twitter: place.social_media.twitter,
              }
            : undefined,
        /* Set at write time so a synced row is immediately eligible for the
           group shortlist and for rebuild_index.py. Was previously only
           applied retroactively by restarunt-Rec/backfill_source.py, which
           left every row written after that one-time run unstamped. */
        source: "foursquare" as const,
        lastFetchedAt: new Date(),
    };
}