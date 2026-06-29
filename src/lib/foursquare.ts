import "server-only"
import { SEARCH_FIELDS } from "../lists/searchFields"


const BASE = "https://places-api.foursquare.com";
const API_KEY = process.env.FOURSQUARE_API_KEY!;
const API_VERSION = process.env.FOURSQUARE_API_VERSION ?? "2025-06-17";

if (!API_KEY) {
  console.warn("[foursquare] FOURSQUARE_API_KEY is not set");
}

async function fsq<T>(path: string, params?: Record<string, string | number>) {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params ?? {})) {
         url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, {
        headers: {
        Authorization: `Bearer ${API_KEY}`,
        "X-Places-Api-Version": API_VERSION,
        accept: "application/json",
        },
        next: { revalidate: 3600 },
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Foursquare ${res.status} on ${path}: ${body}`);
    }
    return (await res.json()) as T;
}

export interface FsqPlace {
  fsq_place_id: string;
  name: string;
  latitude?: number;
  longitude?: number;
  location?: {
    address?: string;
    locality?: string;
    region?: string;
    postcode?: string;
    country?: string;
    formatted_address?: string;
  };
  categories?: { fsq_category_id: string; name: string; icon?: { prefix: string; suffix: string } }[];
  tel?: string;
  website?: string;
  rating?: number;
  price?: number;
  popularity?: number;
  hours?: { display?: string; open_now?: boolean; regular?: { day: number; open: string; close: string }[] };
  photos?: FsqPhoto[];
  tastes?: string[];
}
export interface FsqPhoto { fsq_photo_id?: string; prefix: string; suffix: string; width: number; height: number; }
export interface FsqTip { fsq_tip_id?: string; text: string; created_at?: string; }

export function searchPlaces(opts: {
  query?: string;
  ll?: string;
  near?: string;
  radius?: number;
  categories?: string;
  limit?: number;
  sort?: "RELEVANCE" | "RATING" | "DISTANCE" | "POPULARITY";
}) {
  return fsq<{ results: FsqPlace[] }>("/places/search", {
    ...(opts.query ? { query: opts.query } : {}),
    ...(opts.ll ? { ll: opts.ll } : {}),
    ...(opts.near ? { near: opts.near } : {}),
    ...(opts.radius ? { radius: opts.radius } : {}),
    ...(opts.categories ? { fsq_category_ids: opts.categories } : {}),
    fields: SEARCH_FIELDS,
    limit: opts.limit ?? 20,
    sort: opts.sort ?? "RELEVANCE",
  });
}

export function getPlace(fsqPlaceId: string) {
  return fsq<FsqPlace>(`/places/${fsqPlaceId}`, { fields: SEARCH_FIELDS });
}

export function getPlacePhotos(fsqPlaceId: string, limit = 8) {
  return fsq<FsqPhoto[]>(`/places/${fsqPlaceId}/photos`, { limit });
}

export function getPlaceTips(fsqPlaceId: string, limit = 10) {
  return fsq<FsqTip[]>(`/places/${fsqPlaceId}/tips`, { limit });
}