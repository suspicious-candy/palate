// ---------- Data shapes ----------
// Mirrors src/models/restaurantModel.js (Foursquare-shaped). Optional fields use
// `?` so a partially-synced restaurant still renders — we show placeholders for
// anything that's missing.

type Category = {
    fsqCategoryId?: string;
    name?: string; // e.g. "Modern European Restaurant"
    icon?: { prefix?: string; suffix?: string };
};

type Photo = {
    fsqPhotoId?: string;
    // Build a usable URL with: prefix + "<size>" + suffix
    prefix?: string;
    suffix?: string;
    width?: number;
    height?: number;
};

type Tip = {
    fsqTipId?: string;
    text?: string;
    createdAt?: string;
};

type RegularHours = {
    day: number; // 1 = Monday ... 7 = Sunday
    open: string; // "0900"
    close: string; // "2200"
};

type Hours = {
    displayHours?: string[]; // human-readable, e.g. "Mon-Fri 9:00 AM-10:00 PM"
    openNow?: boolean;
    regular?: RegularHours[];
};

type Restaurant = {
    fsqId: string;
    name: string;
    description?: string;

    categories?: Category[];
    cuisine?: string[];

    location?: {
        formattedAddress?: string;
        address?: string;
        locality?: string; // city
        region?: string; // state
        postcode?: string;
        country?: string;
        neighborhood?: string[];
    };
    geocodes?: { latitude?: number; longitude?: number };

    // Contact
    tel?: string;
    email?: string;
    website?: string;
    socialMedia?: { facebookId?: string; instagram?: string; twitter?: string };

    // Ratings & popularity
    rating?: number; // 0 - 10
    popularity?: number; // 0 - 1
    price?: number; // 1 ($) - 4 ($$$$)
    stats?: { totalPhotos?: number; totalRatings?: number; totalTips?: number };

    hours?: Hours;

    photos?: Photo[];
    tips?: Tip[];
    tastes?: string[]; // crowd tags, e.g. "good for groups"
    features?: Record<string, unknown>; // deeply nested amenities object

    verified?: boolean;
    dateClosed?: string;
};

// ---------- Helpers ----------
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Foursquare photos are stored as prefix + "<size>" + suffix.
function photoUrl(photo: Photo, size = "original"): string {
    if (!photo.prefix || !photo.suffix) return "/placeholder.jpg";
    return `${photo.prefix}${size}${photo.suffix}`;
}

// price 1-4 -> "$".."$$$$"
function priceLabel(price?: number): string {
    if (!price || price < 1) return "";
    return "$".repeat(Math.min(price, 4));
}

// rating is 0-10; show one decimal.
function ratingLabel(rating?: number): string {
    return typeof rating === "number" ? rating.toFixed(1) : "";
}

function dayName(day: number): string {
    return DAY_NAMES[day - 1] ?? "";
}

// "0900" -> "9:00 AM"
function formatClock(hhmm: string): string {
    if (!hhmm || hhmm.length < 3) return hhmm;
    const hours = Number(hhmm.slice(0, hhmm.length - 2));
    const mins = hhmm.slice(-2);
    const period = hours >= 12 ? "PM" : "AM";
    const h12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${h12}:${mins} ${period}`;
}

// Collapse a contact handle into a usable href.
function socialUrl(network: "instagram" | "twitter" | "facebook", handle: string): string {
    const clean = handle.replace(/^@/, "").trim();
    switch (network) {
        case "instagram":
            return `https://instagram.com/${clean}`;
        case "twitter":
            return `https://twitter.com/${clean}`;
        case "facebook":
            return `https://facebook.com/${clean}`;
    }
}

// Walk the flexible `features` amenities object and collect the labels whose
// leaf value is `true` (e.g. { payment: { creditCards: true } } -> "payment / creditCards").
function enabledFeatures(features?: Record<string, unknown>, prefix = ""): string[] {
    if (!features) return [];
    const out: string[] = [];
    for (const [key, value] of Object.entries(features)) {
        const label = prefix ? `${prefix} / ${key}` : key;
        if (value === true) {
            out.push(label);
        } else if (value && typeof value === "object") {
            out.push(...enabledFeatures(value as Record<string, unknown>, label));
        }
    }
    return out;
}

// TODO: replace with a real fetch (dbConfig / Restaurant model) keyed by `id`.
// Hardcoded so the frontend renders for now.
function getResturant(id: string): Restaurant {
    return {
        fsqId: id,
        name: "L'Aura Brasserie",
        description:
            "An immersive dining experience blending classic European techniques with bold, contemporary flavors. Set in a restored 1920s bank, L'Aura offers an atmosphere of refined warmth.",
        categories: [{ name: "Modern European Restaurant" }],
        cuisine: ["Modern European"],
        location: {
            formattedAddress: "1250 N State St, Chicago, IL 60610",
            address: "1250 N State St",
            locality: "Chicago",
            region: "IL",
            postcode: "60610",
            country: "US",
            neighborhood: ["Gold Coast"],
        },
        geocodes: { latitude: 41.9065, longitude: -87.6285 },
        tel: "+1 (312) 555-0188",
        email: "reservations@laura-brasserie.com",
        website: "https://laura-brasserie.com",
        socialMedia: {
            facebookId: "laurabrasserie",
            instagram: "laura.brasserie",
            twitter: "laurabrasserie",
        },
        rating: 9.8,
        popularity: 0.94,
        price: 4,
        stats: { totalPhotos: 312, totalRatings: 128, totalTips: 47 },
        hours: {
            openNow: true,
            displayHours: [
                "Mon-Thu 5:00 PM-10:00 PM",
                "Fri-Sat 5:00 PM-11:30 PM",
                "Sun 4:00 PM-9:00 PM",
            ],
            regular: [
                { day: 1, open: "1700", close: "2200" },
                { day: 2, open: "1700", close: "2200" },
                { day: 3, open: "1700", close: "2200" },
                { day: 4, open: "1700", close: "2200" },
                { day: 5, open: "1700", close: "2330" },
                { day: 6, open: "1700", close: "2330" },
                { day: 7, open: "1600", close: "2100" },
            ],
        },
        photos: [],
        tips: [
            { fsqTipId: "t1", text: "The wood-fired hearth dishes are unmissable.", createdAt: "2026-04-02" },
            { fsqTipId: "t2", text: "Ask for the private booth for a quieter evening.", createdAt: "2026-03-18" },
        ],
        tastes: ["good for groups", "great cocktails", "romantic", "upscale"],
        features: {
            payment: { creditCards: true, digitalWallet: true },
            service: { reservations: true, privateDining: true },
            amenities: { wheelchairAccessible: true, fullBar: true },
        },
        verified: true,
    };
}

// Small reusable placeholder for a missing value.
function Placeholder({ text }: { text: string }) {
    return <span className="italic text-gray-400">{text}</span>;
}

// ---------- Page ----------
// `params` is a Promise in this version of Next.js (sync access is deprecated),
// so the page is async and awaits it. The dynamic segment is `[id]`.
export default async function ResturantProfile({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const rest = getResturant(id);

    // Always render at least one image; fall back to the placeholder when the
    // restaurant has no synced photos.
    const photos = rest.photos ?? [];
    const gallery = photos.length > 0 ? photos.map((p) => photoUrl(p, "600x400")) : ["/placeholder.jpg"];

    const cuisineLabel =
        rest.cuisine?.join(", ") || rest.categories?.map((c) => c.name).filter(Boolean).join(", ");
    const features = enabledFeatures(rest.features);

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900">
            {/* Nav */}
            <nav className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
                <span className="text-lg font-bold text-rose-700">Palate</span>
                <div className="hidden gap-6 text-sm text-gray-600 sm:flex">
                    <a href="#">Discover</a>
                    <a href="#">Activity</a>
                    <a href="#">Groups</a>
                    <a href="#" className="font-semibold text-gray-900">Profile</a>
                </div>
                <div className="h-8 w-8 rounded-full bg-gray-200" />
            </nav>

            <main className="mx-auto max-w-5xl space-y-6 p-6">
                {/* Photo gallery */}
                <section className="grid gap-3 sm:grid-cols-3 sm:grid-rows-2">
                    {gallery.map((src, i) => (
                        <img
                            key={i}
                            src={src}
                            alt={`${rest.name} photo ${i + 1}`}
                            className={
                                i === 0
                                    ? "h-64 w-full rounded-2xl object-cover sm:col-span-2 sm:row-span-2 sm:h-full"
                                    : "h-32 w-full rounded-2xl object-cover"
                            }
                        />
                    ))}
                </section>

                {/* Header: name, cuisine, price, rating */}
                <header className="rounded-2xl bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                                {cuisineLabel || <Placeholder text="Cuisine not listed" />}
                                {rest.price ? <span> · {priceLabel(rest.price)}</span> : null}
                            </p>
                            <h1 className="mt-1 text-2xl font-bold">{rest.name}</h1>
                        </div>
                        {typeof rest.rating === "number" && (
                            <span className="shrink-0 rounded-full bg-rose-700 px-3 py-1 text-sm font-medium text-white">
                                ★ {ratingLabel(rest.rating)}
                                {rest.stats?.totalRatings ? ` (${rest.stats.totalRatings})` : ""}
                            </span>
                        )}
                    </div>
                    <p className="mt-3 text-sm text-gray-600">
                        {rest.description ? rest.description : <Placeholder text="No description yet." />}
                    </p>
                </header>

                {/* Body: main content + contact sidebar */}
                <div className="grid gap-6 lg:grid-cols-3">
                    <div className="space-y-6 lg:col-span-2">
                        {/* Tastes / crowd tags */}
                        <section className="rounded-2xl bg-white p-6 shadow-sm">
                            <h2 className="mb-4 text-lg font-bold">What people love</h2>
                            {rest.tastes && rest.tastes.length > 0 ? (
                                <ul className="flex flex-wrap gap-2">
                                    {rest.tastes.map((t) => (
                                        <li
                                            key={t}
                                            className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700"
                                        >
                                            {t}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-gray-400">No tags yet.</p>
                            )}
                        </section>

                        {/* Amenities / features */}
                        <section className="rounded-2xl bg-white p-6 shadow-sm">
                            <h2 className="mb-4 text-lg font-bold">Amenities</h2>
                            {features.length > 0 ? (
                                <ul className="flex flex-wrap gap-2">
                                    {features.map((f) => (
                                        <li
                                            key={f}
                                            className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600"
                                        >
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-gray-400">No amenities listed.</p>
                            )}
                        </section>

                        {/* Tips */}
                        <section className="rounded-2xl bg-white p-6 shadow-sm">
                            <h2 className="mb-4 text-lg font-bold">Tips</h2>
                            {rest.tips && rest.tips.length > 0 ? (
                                <div className="space-y-3">
                                    {rest.tips.map((tip) => (
                                        <div
                                            key={tip.fsqTipId ?? tip.text}
                                            className="rounded-lg border border-gray-100 p-3"
                                        >
                                            <p className="text-sm">{tip.text}</p>
                                            {tip.createdAt && (
                                                <p className="mt-1 text-xs text-gray-400">{tip.createdAt}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400">No tips yet.</p>
                            )}
                        </section>
                    </div>

                    {/* Contact, socials & hours — replaces the reservation widget */}
                    <aside className="space-y-6 rounded-2xl bg-white p-6 shadow-sm">
                        <div>
                            <h2 className="mb-3 text-lg font-bold">Contact</h2>
                            <dl className="space-y-2 text-sm">
                                <div className="flex justify-between gap-3">
                                    <dt className="text-gray-400">Phone</dt>
                                    <dd className="text-right">
                                        {rest.tel ? (
                                            <a href={`tel:${rest.tel}`} className="text-rose-700 hover:underline">
                                                {rest.tel}
                                            </a>
                                        ) : (
                                            <Placeholder text="Not provided" />
                                        )}
                                    </dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt className="text-gray-400">Email</dt>
                                    <dd className="text-right">
                                        {rest.email ? (
                                            <a href={`mailto:${rest.email}`} className="text-rose-700 hover:underline">
                                                {rest.email}
                                            </a>
                                        ) : (
                                            <Placeholder text="Not provided" />
                                        )}
                                    </dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt className="text-gray-400">Website</dt>
                                    <dd className="text-right">
                                        {rest.website ? (
                                            <a
                                                href={rest.website}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-rose-700 hover:underline"
                                            >
                                                {rest.website}
                                            </a>
                                        ) : (
                                            <Placeholder text="Not provided" />
                                        )}
                                    </dd>
                                </div>
                            </dl>
                        </div>

                        <div className="border-t border-gray-100 pt-4">
                            <h2 className="mb-3 text-lg font-bold">Follow</h2>
                            {rest.socialMedia &&
                            (rest.socialMedia.instagram ||
                                rest.socialMedia.twitter ||
                                rest.socialMedia.facebookId) ? (
                                <ul className="space-y-2 text-sm">
                                    {rest.socialMedia.instagram && (
                                        <li>
                                            <a
                                                href={socialUrl("instagram", rest.socialMedia.instagram)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-rose-700 hover:underline"
                                            >
                                                Instagram: @{rest.socialMedia.instagram}
                                            </a>
                                        </li>
                                    )}
                                    {rest.socialMedia.twitter && (
                                        <li>
                                            <a
                                                href={socialUrl("twitter", rest.socialMedia.twitter)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-rose-700 hover:underline"
                                            >
                                                Twitter: @{rest.socialMedia.twitter}
                                            </a>
                                        </li>
                                    )}
                                    {rest.socialMedia.facebookId && (
                                        <li>
                                            <a
                                                href={socialUrl("facebook", rest.socialMedia.facebookId)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-rose-700 hover:underline"
                                            >
                                                Facebook
                                            </a>
                                        </li>
                                    )}
                                </ul>
                            ) : (
                                <Placeholder text="No social links yet." />
                            )}
                        </div>

                        <div className="border-t border-gray-100 pt-4">
                            <h2 className="mb-3 text-lg font-bold">Location</h2>
                            <address className="text-sm not-italic text-gray-600">
                                {rest.location?.formattedAddress || (
                                    <Placeholder text="Address not provided" />
                                )}
                                {rest.location?.neighborhood && rest.location.neighborhood.length > 0 && (
                                    <span className="block text-gray-400">
                                        {rest.location.neighborhood.join(", ")}
                                    </span>
                                )}
                            </address>
                        </div>

                        <div className="border-t border-gray-100 pt-4">
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="text-lg font-bold">Hours</h2>
                                {rest.hours?.openNow !== undefined && (
                                    <span
                                        className={
                                            rest.hours.openNow
                                                ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
                                                : "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
                                        }
                                    >
                                        {rest.hours.openNow ? "Open now" : "Closed now"}
                                    </span>
                                )}
                            </div>
                            {rest.hours?.displayHours && rest.hours.displayHours.length > 0 ? (
                                <ul className="space-y-1 text-sm text-gray-600">
                                    {rest.hours.displayHours.map((line) => (
                                        <li key={line}>{line}</li>
                                    ))}
                                </ul>
                            ) : rest.hours?.regular && rest.hours.regular.length > 0 ? (
                                <ul className="space-y-1 text-sm text-gray-600">
                                    {rest.hours.regular.map((h) => (
                                        <li key={h.day} className="flex justify-between gap-3">
                                            <span className="text-gray-400">{dayName(h.day)}</span>
                                            <span>
                                                {formatClock(h.open)} – {formatClock(h.close)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <Placeholder text="Hours not available" />
                            )}
                        </div>
                    </aside>
                </div>

                <footer className="py-6 text-center text-xs text-gray-400">
                    © {new Date().getFullYear()} {rest.name}. All rights reserved.
                </footer>
            </main>
        </div>
    );
}
