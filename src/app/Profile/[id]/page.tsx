// ---------- Data shapes ----------
// Each restaurant/reservation carries its own unique `id` (table numbers repeat,
// so they can't be used as React keys).

type Reservation = {
    id: string;
    name: string;
    rating: number;
    resDate: Date;
    numGuests: number;
    tableNum: number;
    numVisits: number;
};

type Address = {
    id: string;
    label: string;   // e.g. "Home", "Office"
    address: string;
};

type HistoryItem = {
    id: string;
    name: string;
    date: Date;
    numGuests: number;
    status: "Completed" | "Cancelled" | "Upcoming";
};

// Optional fields use `?` so a brand-new user (who hasn't filled everything in)
// still renders — we show placeholders and collect more info later.
type UserProfile = {
    id: string;
    profilePic?: string;
    firstName?: string;
    lastName?: string;
    StarmembershipStatus?: boolean;
    firstOrderDate?: Date;
    numVisits?: number;
    favDish?: string;
    email?: string;
    phone?: string;
    dob?: Date;
    reservations: Reservation[];
    visitedResturants: Reservation[];
    savedAddresses: Address[];
    reservationHistory: HistoryItem[];
};

type Props = { params: { id: string } };

// ---------- Helpers ----------
function formatMonthYear(date: Date): string {
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatLongDate(date: Date): string {
    return date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
    });
}

function formatTime(date: Date): string {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fullName(u: UserProfile): string {
    return [u.firstName, u.lastName].filter(Boolean).join(" ");
}

function initials(u: UserProfile): string {
    const f = u.firstName?.[0] ?? "";
    const l = u.lastName?.[0] ?? "";
    return (f + l).toUpperCase() || "?";
}

// TODO: replace with a real fetch (dbConfig / API) keyed by `id`.
// Hardcoded so the frontend renders for now.
function getUser(id: string): UserProfile {
    return {
        id,
        profilePic: "",
        firstName: "Eleanor",
        lastName: "Vance",
        StarmembershipStatus: true,
        firstOrderDate: new Date("2021-10-01"),
        numVisits: 14,
        favDish: "pizza",
        email: "e.vance@palate-quest.com",
        phone: "+1 (555) 123-4567",
        dob: new Date("1985-10-01"),
        reservations: [
            {
                id: "r1",
                name: "Osteria Rustica",
                rating: 4.8,
                resDate: new Date("2026-06-26T20:00:00"),
                numGuests: 2,
                tableNum: 5,
                numVisits: 3,
            },
        ],
        visitedResturants: [
            { id: "v1", name: "Pizano Heritage", rating: 4.9, resDate: new Date("2024-05-12"), numGuests: 4, tableNum: 2, numVisits: 9 },
            { id: "v2", name: "Trattoria Roma", rating: 4.6, resDate: new Date("2024-04-28"), numGuests: 2, tableNum: 7, numVisits: 6 },
            { id: "v3", name: "Osteria Rustica", rating: 4.8, resDate: new Date("2024-03-15"), numGuests: 2, tableNum: 5, numVisits: 3 },
            { id: "v4", name: "Bella Napoli", rating: 4.5, resDate: new Date("2024-02-02"), numGuests: 3, tableNum: 1, numVisits: 2 },
        ],
        savedAddresses: [
            { id: "a1", label: "Home", address: "221B Baker St, London, NW1 6XE" },
            { id: "a2", label: "Office", address: "100 City Rd, Shoreditch, EC1Y 2BP" },
        ],
        reservationHistory: [
            { id: "h1", name: "Pizano Heritage", date: new Date("2024-05-12"), numGuests: 4, status: "Completed" },
            { id: "h2", name: "Trattoria Roma", date: new Date("2024-04-28"), numGuests: 2, status: "Completed" },
        ],
    };
}

// Small reusable placeholder for a missing value.
function Placeholder({ text }: { text: string }) {
    return <span className="italic text-gray-400">{text}</span>;
}

// ---------- Page ----------
export default function UserProfile({ params }: Props) {
    const user = getUser(params.id);

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900">
            {/* Nav */}
            <nav className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
                <span className="text-lg font-bold text-rose-700">Palate</span>
                <div className="hidden gap-6 text-sm text-gray-600 sm:flex">
                    <a href="#">Home</a>
                    <a href="#">Menu</a>
                    <a href="#">Reservations</a>
                    <a href="#" className="font-semibold text-gray-900">Profile</a>
                </div>
                <div className="h-8 w-8 overflow-hidden rounded-full bg-gray-200">
                    {user.profilePic ? (
                        <img src={user.profilePic} alt="" className="h-full w-full object-cover" />
                    ) : (
                        <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-gray-500">
                            {initials(user)}
                        </span>
                    )}
                </div>
            </nav>

            <main className="mx-auto max-w-5xl space-y-6 p-6">
                {/* Profile header */}
                <header className="flex flex-col items-start justify-between gap-4 rounded-2xl bg-white p-6 shadow-sm sm:flex-row sm:items-center">
                    <div className="flex items-center gap-4">
                        <div className="h-20 w-20 overflow-hidden rounded-full bg-gray-200">
                            {user.profilePic ? (
                                <img src={user.profilePic} alt="Profile" className="h-full w-full object-cover" />
                            ) : (
                                <span className="flex h-full w-full items-center justify-center text-xl font-semibold text-gray-500">
                                    {initials(user)}
                                </span>
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-bold">
                                    {fullName(user) || <Placeholder text="Unnamed guest" />}
                                </h1>
                                {user.StarmembershipStatus && (
                                    <span className="rounded-full bg-rose-700 px-2 py-0.5 text-xs font-medium text-white">
                                        Star Member
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 text-sm text-gray-500">
                                {user.favDish ? `Dedicated ${user.favDish} enthusiast` : "Food lover"}
                                {user.firstOrderDate && ` and member since ${formatMonthYear(user.firstOrderDate)}`}
                                {typeof user.numVisits === "number" && `. ${user.numVisits} visits and counting`}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button type="button" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50">
                            Edit Profile
                        </button>
                        <button type="button" className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white hover:bg-rose-800">
                            Book Table
                        </button>
                    </div>
                </header>

                {/* Upcoming + Favourites */}
                <div className="grid gap-6 md:grid-cols-2">
                    {/* Upcoming Reservations */}
                    <section className="rounded-2xl bg-white p-6 shadow-sm">
                        <p className="text-xs font-semibold tracking-wide text-gray-400">NEXT VISIT</p>
                        <h2 className="mb-4 text-lg font-bold">Upcoming Reservations</h2>
                        {user.reservations.filter((r) => r.resDate >= new Date()).length === 0 ? (
                            <p className="text-sm text-gray-400">
                                No upcoming reservations yet — book a table to get started.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {user.reservations
                                    .filter((r) => r.resDate >= new Date())
                                    .map((r) => (
                                        <RestaurantCard key={r.id} restaurant={r} />
                                    ))}
                            </div>
                        )}
                    </section>

                    {/* Favourites — top 3 most visited */}
                    <section className="rounded-2xl bg-white p-6 shadow-sm">
                        <p className="text-xs font-semibold tracking-wide text-gray-400">PERSONALIZED</p>
                        <h2 className="mb-4 text-lg font-bold">Favourites</h2>
                        {user.visitedResturants.length === 0 ? (
                            <p className="text-sm text-gray-400">
                                Your favourites will appear here once you’ve dined with us.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {user.visitedResturants
                                    .slice()
                                    .sort((a, b) => b.numVisits - a.numVisits)
                                    .slice(0, 3)
                                    .map((r) => (
                                        <FavouriteCard key={r.id} restaurant={r} />
                                    ))}
                            </div>
                        )}
                    </section>
                </div>

                {/* Personal Information */}
                <section className="rounded-2xl bg-white p-6 shadow-sm">
                    <h2 className="mb-4 text-lg font-bold">Personal Information</h2>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Full Name" value={fullName(user)} />
                        <Field label="Email Address" value={user.email} />
                        <Field label="Phone Number" value={user.phone} />
                        <Field label="Date of Birth" value={user.dob ? formatLongDate(user.dob) : ""} />
                    </div>
                </section>

                {/* Saved Addresses */}
                <section className="rounded-2xl bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-lg font-bold">Saved Addresses</h2>
                        <button type="button" className="text-sm font-medium text-rose-700 hover:underline">
                            + Add New
                        </button>
                    </div>
                    {user.savedAddresses.length === 0 ? (
                        <p className="text-sm text-gray-400">
                            No saved addresses yet — add one to speed up booking and delivery.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {user.savedAddresses.map((a) => (
                                <div key={a.id} className="flex items-start justify-between rounded-lg border border-gray-100 p-3">
                                    <div>
                                        <p className="text-sm font-semibold">{a.label}</p>
                                        <p className="text-sm text-gray-500">{a.address}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Reservation History */}
                <section className="rounded-2xl bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-lg font-bold">Reservation History</h2>
                        <button type="button" className="text-sm font-medium text-rose-700 hover:underline">
                            View All
                        </button>
                    </div>
                    {user.reservationHistory.length === 0 ? (
                        <p className="text-sm text-gray-400">
                            You haven’t dined with us yet — your past reservations will show up here.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="text-xs uppercase tracking-wide text-gray-400">
                                    <tr>
                                        <th className="pb-2">Restaurant</th>
                                        <th className="pb-2">Date</th>
                                        <th className="pb-2">Guests</th>
                                        <th className="pb-2">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {user.reservationHistory.map((h) => (
                                        <tr key={h.id} className="border-t border-gray-100">
                                            <td className="py-3 font-medium">{h.name}</td>
                                            <td className="py-3 text-gray-500">{formatLongDate(h.date)}</td>
                                            <td className="py-3 text-gray-500">{h.numGuests} Guests</td>
                                            <td className="py-3">
                                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                                    {h.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <footer className="py-6 text-center text-xs text-gray-400">
                    © {new Date().getFullYear()} Pizano Restaurant Heritage. All rights reserved.
                </footer>
            </main>
        </div>
    );
}

// A labelled read-only field with a placeholder when empty.
function Field({ label, value }: { label: string; value?: string }) {
    return (
        <div>
            <p className="mb-1 text-xs font-medium text-gray-400">{label}</p>
            <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                {value && value.trim() ? value : <Placeholder text="Not provided" />}
            </div>
        </div>
    );
}

// Favourites / Personalized card — shows name, rating and how many times visited.
function FavouriteCard({ restaurant }: { restaurant: Reservation }) {
    return (
        <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
            <div className="flex items-center gap-2">
                <h3 className="font-semibold">{restaurant.name}</h3>
                <span className="text-sm text-gray-400">— {restaurant.rating} ⭐</span>
            </div>
            <span className="text-sm text-gray-500">
                {restaurant.numVisits} {restaurant.numVisits === 1 ? "visit" : "visits"}
            </span>
        </div>
    );
}

function RestaurantCard({ restaurant }: { restaurant: Reservation }) {
    return (
        <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
            <div>
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{restaurant.name}</h3>
                    <span className="text-sm text-gray-400">{restaurant.rating} ⭐</span>
                </div>
                {restaurant.resDate && (
                    <p className="text-sm text-gray-500">
                        {formatLongDate(restaurant.resDate)} at {formatTime(restaurant.resDate)}
                    </p>
                )}
            </div>
            <div className="text-right text-sm text-gray-500">
                <p>{restaurant.numGuests} Guests</p>
                <p>Table #{restaurant.tableNum}</p>
            </div>
        </div>
    );
}
