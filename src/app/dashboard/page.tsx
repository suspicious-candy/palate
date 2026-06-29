import { connect } from "@/dbConfig/dbConfig";
import Restaurant from "@/models/restaurantModel.js";
import { FOOD_CATEGORIES } from "@/app/lists/foodCategories";
import Link from "next/link";

// This is a Server Component (async). Any console.log below prints in the
// TERMINAL running `npm run dev` — NOT the browser DevTools console.
//
// `searchParams` is a Promise in this version of Next.js (see AGENTS.md),
// so we await it. The category is driven by the URL: /dashboard?category=Italian

type DashboardSearchParams = {
    category?: string;
};

export default async function Dashboard({
    searchParams,
}: {
    searchParams: Promise<DashboardSearchParams>;
}) {
    await connect();
    const { category } = await searchParams;

    // Stored category names look like "Italian Restaurant", while the chips use
    // the short name "Italian" — so we match case-insensitively with a regex
    // instead of an exact string equality.
    const filter = category
        ? { "categories.name": { $regex: category, $options: "i" } }
        : {};

    const restaurants = await Restaurant.find(filter)
        .sort({ rating: -1 })
        .limit(30)
        .lean();

    // Debug — watch your terminal, not the browser.
    console.log("[dashboard] filter:", JSON.stringify(filter));
    console.log(
        "[dashboard] found:",
        restaurants.length,
        restaurants.map((r) => r.name)
    );

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900">
            <nav className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
                <span className="text-lg font-bold text-rose-700">Palate</span>
            </nav>

            <main className="mx-auto max-w-5xl space-y-6 p-6">
                {/* Category chips — clicking one sets ?category= in the URL */}
                <section className="flex flex-wrap gap-2">
                    <Link
                        href="/dashboard"
                        className={
                            !category
                                ? "rounded-full bg-rose-700 px-3 py-1 text-xs font-medium text-white"
                                : "rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600"
                        }
                    >
                        All
                    </Link>
                    {FOOD_CATEGORIES.map((c) => {
                        const active =
                            category?.toLowerCase() === c.name.toLowerCase();
                        return (
                            <Link
                                key={c.name}
                                href={`/dashboard?category=${encodeURIComponent(c.name)}`}
                                className={
                                    active
                                        ? "rounded-full bg-rose-700 px-3 py-1 text-xs font-medium text-white"
                                        : "rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600"
                                }
                            >
                                {c.name}
                            </Link>
                        );
                    })}
                </section>

                {/* Results */}
                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {restaurants.length === 0 ? (
                        <p className="col-span-full text-sm text-gray-400">
                            No restaurants found
                            {category ? ` for "${category}"` : ""}.
                        </p>
                    ) : (
                        restaurants.map((r) => (
                            <Link
                                key={r.fsqId}
                                href={`/resturant/${r.fsqId}`}
                                className="rounded-2xl bg-white p-4 shadow-sm transition hover:shadow-md"
                            >
                                <h2 className="font-bold">{r.name}</h2>
                                <p className="mt-1 text-xs text-gray-500">
                                    {r.categories
                                        ?.map((c: { name?: string }) => c.name)
                                        .filter(Boolean)
                                        .join(", ") || "Uncategorized"}
                                </p>
                                {typeof r.rating === "number" && (
                                    <p className="mt-2 text-sm text-rose-700">
                                        ★ {r.rating.toFixed(1)}
                                    </p>
                                )}
                            </Link>
                        ))
                    )}
                </section>
            </main>
        </div>
    );
}
