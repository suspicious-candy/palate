// ---------- Data shapes ----------
// Mirrors src/models/restaurantModel.js. Keeps Pro fields plus `rating` and
// `tips` (reviews). Other Premium fields (photos, price, hours, tastes,
// description, features) are intentionally omitted to keep requests lean.
// Optional fields use `?` so a partially-synced restaurant still renders.

type Category = {
    fsqCategoryId?: string;
    name?: string; // e.g. "Modern European Restaurant"
    icon?: { prefix?: string; suffix?: string };
};

type Tip = {
    fsqTipId?: string;
    text?: string;
    createdAt?: string;
};

type Restaurant = {
    fsqId: string;
    name: string;

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

    // Ratings & reviews
    rating?: number; // 0 - 10
    tips?: Tip[];

    dateClosed?: string;
};

// ---------- Helpers ----------

// rating is 0-10; show one decimal.
function ratingLabel(rating?: number): string {
    return typeof rating === "number" ? rating.toFixed(1) : "";
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

// TODO: replace with a real fetch (dbConfig / Restaurant model) keyed by `id`.
// Hardcoded so the frontend renders for now.
function getResturant(id: string): Restaurant {
    return {
        fsqId: id,
        name: "L'Aura Brasserie",
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
        tips: [
            { fsqTipId: "t1", text: "The wood-fired hearth dishes are unmissable.", createdAt: "2026-04-02" },
            { fsqTipId: "t2", text: "Ask for the private booth for a quieter evening.", createdAt: "2026-03-18" },
        ],
    };
}

function Placeholder({ text }: { text: string }) {
    return <span className="italic text-gray-400">{text}</span>;
}

// ---------- Page ----------
// `params` is a Promise in this version of Next.js (sync access is deprecated),
// so the page is async and awaits it. The dynamic segment is `[id]`.
export default async function ResturantProfile({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const rest = getResturant(id);

    const cuisineLabel =
        rest.cuisine?.join(", ") || rest.categories?.map((c) => c.name).filter(Boolean).join(", ");

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
                <header className="rounded-2xl bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                                {cuisineLabel || <Placeholder text="Cuisine not listed" />}
                            </p>
                            <h1 className="mt-1 text-2xl font-bold">{rest.name}</h1>
                        </div>
                        {typeof rest.rating === "number" && (
                            <span className="shrink-0 rounded-full bg-rose-700 px-3 py-1 text-sm font-medium text-white">
                                <i className="ph-fill ph-star" /> {ratingLabel(rest.rating)}
                            </span>
                        )}
                    </div>
                </header>

                <div className="grid gap-6 lg:grid-cols-3">
                    <div className="space-y-6 lg:col-span-2">
                        <section className="rounded-2xl bg-white p-6 shadow-sm">
                            <h2 className="mb-4 text-lg font-bold">Reviews</h2>
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
                                <p className="text-sm text-gray-400">No reviews yet.</p>
                            )}
                        </section>
                    </div>

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
                    </aside>
                </div>

                <footer className="py-6 text-center text-xs text-gray-400">
                    © {new Date().getFullYear()} {rest.name}. All rights reserved.
                </footer>
            </main>
        </div>
    );
}
