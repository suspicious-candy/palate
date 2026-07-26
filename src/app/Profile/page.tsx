"use client"
import React from "react";
import Nav from "@/components/Nav";
import {
    useUser,
    type User,
    type Restaurant,
    type Reservation,
    type Address,
} from "@/lib/userContext";

type ReservationStatus = Reservation["status"];

// ---------- Helpers ----------
// Every date here crosses the wire as an ISO string, so each helper normalises
// with `new Date(...)` rather than trusting the declared type.
function formatMonthYear(date: string | Date): string {
    return new Date(date).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatLongDate(date: string | Date): string {
    return new Date(date).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
    });
}

function formatTime(date: string | Date): string {
    return new Date(date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fullName(u: User): string {
    return [u.firstName, u.lastName].filter(Boolean).join(" ");
}

function initials(u: User): string {
    const f = u.firstName?.[0] ?? "";
    const l = u.lastName?.[0] ?? "";
    return (f + l).toUpperCase() || u.username?.[0]?.toUpperCase() || "?";
}

// rating is 0-10 in the restaurant model; show one decimal.
function ratingLabel(rating?: number): string {
    return typeof rating === "number" ? rating.toFixed(1) : "";
}

// Flatten the structured address sub-object into one readable line.
function formatAddress(a: Address["address"]): string {
    const street = [a.aptNumber, a.streetAddress].filter(Boolean).join(" ");
    return [street, a.city, a.state, a.country, a.pincode].filter(Boolean).join(", ");
}

// Small reusable placeholder for a missing value.
function Placeholder({ text }: { text: string }) {
    return <span className="italic text-gray-400">{text}</span>;
}

// ---------- Page ----------
export default function UserProfile() {
    const { user, loading } = useUser();

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50">
                <Nav />
                <p className="p-6 text-sm text-gray-400">Loading your profile…</p>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="min-h-screen bg-gray-50">
                <Nav />
                <p className="p-6 text-sm text-gray-500">
                    Please sign in to view your profile.
                </p>
            </div>
        );
    }

    // The reservations sweep in GET /api/reservations flips past bookings to
    // "completed", so anything still "confirmed" is upcoming.
    const reservations = user.reservations ?? [];
    const visited = user.visitedResturants ?? [];
    const addresses = user.savedAddresses ?? [];
    const history = user.reservationHistory ?? [];
    const upcoming = reservations.filter((r) => r.status === "confirmed");

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900">
            <Nav user={user} />

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
                            <p className="mt-0.5 text-sm text-gray-400">@{user.username}</p>
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
                        {upcoming.length === 0 ? (
                            <p className="text-sm text-gray-400">
                                No upcoming reservations yet — book a table to get started.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {upcoming.map((r) => (
                                    <ReservationCard key={r._id} reservation={r} />
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Favourites — top 3 highest rated places they've visited */}
                    <section className="rounded-2xl bg-white p-6 shadow-sm">
                        <p className="text-xs font-semibold tracking-wide text-gray-400">PERSONALIZED</p>
                        <h2 className="mb-4 text-lg font-bold">Favourites</h2>
                        {visited.length === 0 ? (
                            <p className="text-sm text-gray-400">
                                Your favourites will appear here once you’ve dined with us.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {visited
                                    .slice()
                                    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
                                    .slice(0, 3)
                                    .map((r) => (
                                        <FavouriteCard key={r.fsqId} restaurant={r} />
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
                        <Field label="Username" value={user.username} />
                        <Field label="Email Address" value={user.email} />
                        <Field label="Phone Number" value={user.phone} />
                        <Field label="Date of Birth" value={user.dob ? formatLongDate(user.dob) : ""} />
                        <Field label="Favourite Dish" value={user.favDish} />
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
                    {addresses.length === 0 ? (
                        <p className="text-sm text-gray-400">
                            No saved addresses yet — add one to speed up booking and delivery.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {addresses.map((a) => (
                                <div key={a._id} className="flex items-start justify-between rounded-lg border border-gray-100 p-3">
                                    <div>
                                        <p className="text-sm font-semibold">
                                            {a.label ?? <Placeholder text="Address" />}
                                        </p>
                                        <p className="text-sm text-gray-500">{formatAddress(a.address)}</p>
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
                    {history.length === 0 ? (
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
                                    {history.map((h) => (
                                        <tr key={h._id} className="border-t border-gray-100">
                                            <td className="py-3 font-medium">
                                                {h.restaurant?.name ?? <Placeholder text="Unknown" />}
                                            </td>
                                            <td className="py-3 text-gray-500">{formatLongDate(h.date)}</td>
                                            <td className="py-3 text-gray-500">{h.partySize} Guests</td>
                                            <td className="py-3">
                                                <StatusBadge status={h.status} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <footer className="py-6 text-center text-xs text-gray-400">
                    © {new Date().getFullYear()} Palate. All rights reserved.
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

// Colored pill for a reservation status (matches the model's enum).
function StatusBadge({ status }: { status: ReservationStatus }) {
    const tone: Record<ReservationStatus, string> = {
        completed: "bg-green-100 text-green-700",
        confirmed: "bg-blue-100 text-blue-700",
        cancelled: "bg-red-100 text-red-700",
    };
    return (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${tone[status]}`}>
            {status}
        </span>
    );
}

// Favourites / Personalized card — shows the restaurant name, rating and a hint
// of cuisine / location.
function FavouriteCard({ restaurant }: { restaurant: Restaurant }) {
    const sub =
        restaurant.cuisine?.[0] ||
        restaurant.categories?.[0]?.name ||
        [restaurant.location?.locality, restaurant.location?.region].filter(Boolean).join(", ");
    return (
        <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
            <div className="flex items-center gap-2">
                <h3 className="font-semibold">{restaurant.name}</h3>
                {typeof restaurant.rating === "number" && (
                    <span className="text-sm text-gray-400">— {ratingLabel(restaurant.rating)} ⭐</span>
                )}
            </div>
            {sub && <span className="text-sm text-gray-500">{sub}</span>}
        </div>
    );
}

// Upcoming reservation card — restaurant + when + party size + status.
function ReservationCard({ reservation }: { reservation: Reservation }) {
    const { restaurant } = reservation;
    return (
        <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
            <div>
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold">
                        {restaurant?.name ?? <Placeholder text="Unknown" />}
                    </h3>
                    {typeof restaurant?.rating === "number" && (
                        <span className="text-sm text-gray-400">{ratingLabel(restaurant.rating)} ⭐</span>
                    )}
                </div>
                <p className="text-sm text-gray-500">
                    {formatLongDate(reservation.date)} at {formatTime(reservation.date)}
                </p>
                {reservation.notes && <p className="mt-0.5 text-xs text-gray-400">{reservation.notes}</p>}
            </div>
            <div className="text-right text-sm text-gray-500">
                <p>{reservation.partySize} Guests</p>
                <div className="mt-1">
                    <StatusBadge status={reservation.status} />
                </div>
            </div>
        </div>
    );
}
