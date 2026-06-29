import type { FsqPlace } from "@/lib/foursquare";



export function mapPlaceToResturant(p:FsqPlace){
    const lat = p.latitude;
    const lng = p.longitude;

    return ({
        fsqId: p.fsq_place_id,
        name: p.name,
        categories: (p.categories ?? []).map((c) => ({
            fsqCategoryId: c.fsq_category_id,
            name: c.name,
            icon: c.icon,
        })),
        cuisine: (p.categories ?? []).map((c) => c.name),
        location: {
            formattedAddress: p.location?.formatted_address,
            address: p.location?.address,
            locality: p.location?.locality,
            region: p.location?.region,
            postcode: p.location?.postcode,
            country: p.location?.country,
        },

        geocodes: { latitude: lat, longitude: lng },
        geo:
            lat != null && lng != null
                ? { type: "Point", coordinates: [lng, lat] }
                : undefined,

        tel: p.tel,
        website: p.website,
        rating: p.rating,
        price: p.price,
        popularity: p.popularity,

        photos: (p.photos ?? []).map((ph) => ({
            fsqPhotoId: ph.fsq_photo_id,
            prefix: ph.prefix,
            suffix: ph.suffix,
            width: ph.width,
            height: ph.height,
        })),
        tastes: p.tastes ?? [],
        lastFetchedAt: new Date(),
    });
}