const FOURSQUARE_BASE_URL = "https://places-api.foursquare.com/places/search";

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

export async function searchFoursquarePlaces(
    latitude: number,
    longitude: number,
    radiusMeters: number
): Promise<FoursquarePlace[]> {
    const url = `${FOURSQUARE_BASE_URL}?ll=${latitude},${longitude}&radius=${radiusMeters}&limit=50&query=restaurant`;

    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${process.env.FOURSQUARE_API_KEY}`,
            "X-Places-Api-Version": process.env.FOURSQUARE_API_VERSION!,
            accept: "application/json",
        },
    });

    if (!res.ok) {
        throw new Error(`Foursquare search failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return data.results as FoursquarePlace[];
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