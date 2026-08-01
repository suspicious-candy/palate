"use client"
import React from "react";
import Nav from "@/components/Nav";
import styles from "./profile.module.css";
import {
    useUser,
    type User,
    type Restaurant,
    type Reservation,
    type Address,
} from "@/lib/userContext";

type ReservationStatus = Reservation["status"];

const STATUS_CLASS: Record<ReservationStatus, string> = {
    confirmed: styles.statusConfirmed,
    completed: styles.statusCompleted,
    cancelled: styles.statusCancelled,
};

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

// A date of birth is a calendar date, not a moment in time. It's stored as
// midnight UTC, so formatting it in the viewer's local zone rolls it back a day
// anywhere west of Greenwich — read it back in UTC to get the date as entered.
function formatBirthDate(date: string | Date): string {
    return new Date(date).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
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
    return <span className={styles.placeholder}>{text}</span>;
}

function SectionHead({
    numeral,
    title,
    action,
}: {
    numeral: string;
    title: string;
    action?: string;
}) {
    return (
        <div className={styles.sectionHead}>
            <span className={styles.numeral}>{numeral}</span>
            <h2 className={styles.sectionTitle}>{title}</h2>
            <span className={styles.rule} />
            {action && (
                <button type="button" className={styles.headLink}>
                    {action}
                </button>
            )}
        </div>
    );
}

// ---------- Page ----------
export default function UserProfile() {
    const { user, loading } = useUser();

    if (loading) {
        return (
            <div className={styles.screen}>
                <Nav />
                <p className={styles.notice}>Loading your profile…</p>
            </div>
        );
    }

    if (!user) {
        return (
            <div className={styles.screen}>
                <Nav />
                <p className={styles.notice}>Please sign in to view your profile.</p>
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
        <div className={styles.screen}>
            <Nav user={user} />

            <main className={styles.page}>
                {/* Hero */}
                <header className={styles.hero}>
                    <div className={styles.identity}>
                        <div className={styles.avatar}>
                            {user.profilePic ? (
                                <img src={user.profilePic} alt="" className={styles.avatarImg} />
                            ) : (
                                <span className={styles.avatarInitials}>{initials(user)}</span>
                            )}
                        </div>
                        <div>
                            <div className={styles.nameRow}>
                                <h1 className={styles.name}>
                                    {fullName(user) || <Placeholder text="Unnamed guest" />}
                                </h1>
                                {user.StarmembershipStatus && (
                                    <span className={styles.star}>Star Member</span>
                                )}
                            </div>
                            <p className={styles.handle}>@{user.username}</p>
                            <p className={styles.tagline}>
                                {user.favDish ? `Dedicated ${user.favDish} enthusiast` : "Food lover"}
                                {user.firstOrderDate && ` · member since ${formatMonthYear(user.firstOrderDate)}`}
                                {typeof user.numVisits === "number" && ` · ${user.numVisits} visits and counting`}
                            </p>
                        </div>
                    </div>
                    <div className={styles.actions}>
                        <button type="button" className={styles.btn}>
                            Edit Profile
                        </button>
                        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`}>
                            Book Table
                        </button>
                    </div>
                </header>

                {/* Upcoming + Favourites */}
                <div className={styles.grid}>
                    <section className={styles.card}>
                        <SectionHead numeral="I." title="Next visit" />
                        {upcoming.length === 0 ? (
                            <div className={styles.empty}>
                                <i className={`ph ph-calendar-x ${styles.emptyIcon}`} />
                                <span>No upcoming reservations yet — book a table to get started.</span>
                            </div>
                        ) : (
                            <div className={styles.list}>
                                {upcoming.map((r) => (
                                    <ReservationRow key={r._id} reservation={r} />
                                ))}
                            </div>
                        )}
                    </section>

                    <section className={styles.card}>
                        <SectionHead numeral="II." title="Favourites" />
                        {visited.length === 0 ? (
                            <div className={styles.empty}>
                                <i className={`ph ph-heart ${styles.emptyIcon}`} />
                                <span>Your favourites will appear here once you’ve dined with us.</span>
                            </div>
                        ) : (
                            <div className={styles.list}>
                                {visited
                                    .slice()
                                    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
                                    .slice(0, 3)
                                    .map((r) => (
                                        <FavouriteRow key={r.fsqId} restaurant={r} />
                                    ))}
                            </div>
                        )}
                    </section>
                </div>

                {/* Personal Information */}
                <section className={styles.card}>
                    <SectionHead numeral="III." title="Personal information" />
                    <div className={styles.fieldGrid}>
                        <Field label="Full Name" value={fullName(user)} />
                        <Field label="Username" value={user.username} />
                        <Field label="Email Address" value={user.email} />
                        <Field label="Phone Number" value={user.phone} />
                        <Field label="Date of Birth" value={user.dob ? formatBirthDate(user.dob) : ""} />
                        <Field label="Favourite Dish" value={user.favDish} />
                    </div>
                </section>

                {/* Saved Addresses */}
                <section className={styles.card}>
                    <SectionHead numeral="IV." title="Saved addresses" action="+ Add New" />
                    {addresses.length === 0 ? (
                        <div className={styles.empty}>
                            <i className={`ph ph-map-pin ${styles.emptyIcon}`} />
                            <span>No saved addresses yet — add one to speed up booking and delivery.</span>
                        </div>
                    ) : (
                        <div className={styles.list}>
                            {addresses.map((a) => (
                                <div key={a._id} className={styles.row}>
                                    <div className={styles.rowMain}>
                                        <p className={styles.rowTitle}>
                                            {a.label ?? <Placeholder text="Address" />}
                                        </p>
                                        <p className={styles.rowMeta}>{formatAddress(a.address)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Reservation History */}
                <section className={styles.card}>
                    <SectionHead numeral="V." title="Reservation history" action="View All" />
                    {history.length === 0 ? (
                        <div className={styles.empty}>
                            <i className={`ph ph-clock-counter-clockwise ${styles.emptyIcon}`} />
                            <span>You haven’t dined with us yet — your past reservations will show up here.</span>
                        </div>
                    ) : (
                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Restaurant</th>
                                        <th>Date</th>
                                        <th>Guests</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map((h) => (
                                        <tr key={h._id}>
                                            <td>{h.restaurant?.name ?? <Placeholder text="Unknown" />}</td>
                                            <td>{formatLongDate(h.date)}</td>
                                            <td>{h.partySize} Guests</td>
                                            <td>
                                                <StatusBadge status={h.status} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <footer className={styles.footer}>
                    © {new Date().getFullYear()} Palate
                </footer>
            </main>
        </div>
    );
}

// A labelled read-only field with a placeholder when empty.
function Field({ label, value }: { label: string; value?: string }) {
    return (
        <div>
            <p className={styles.fieldLabel}>{label}</p>
            <div className={styles.fieldValue}>
                {value && value.trim() ? value : <Placeholder text="Not provided" />}
            </div>
        </div>
    );
}

// Colored pill for a reservation status (matches the model's enum).
function StatusBadge({ status }: { status: ReservationStatus }) {
    return (
        <span className={`${styles.status} ${STATUS_CLASS[status]}`}>{status}</span>
    );
}

// Favourites row — restaurant name, rating and a hint of cuisine / location.
function FavouriteRow({ restaurant }: { restaurant: Restaurant }) {
    const sub =
        restaurant.cuisine?.[0] ||
        restaurant.categories?.[0]?.name ||
        [restaurant.location?.locality, restaurant.location?.region].filter(Boolean).join(", ");
    return (
        <div className={styles.row}>
            <div className={styles.rowMain}>
                <h3 className={styles.rowTitle}>
                    {restaurant.name}
                    {typeof restaurant.rating === "number" && (
                        <span className={styles.rating}>{ratingLabel(restaurant.rating)} ★</span>
                    )}
                </h3>
            </div>
            {sub && <span className={styles.sub}>{sub}</span>}
        </div>
    );
}

// Upcoming reservation row — restaurant + when + party size + status.
function ReservationRow({ reservation }: { reservation: Reservation }) {
    const { restaurant } = reservation;
    return (
        <div className={styles.row}>
            <div className={styles.rowMain}>
                <h3 className={styles.rowTitle}>
                    {restaurant?.name ?? <Placeholder text="Unknown" />}
                    {typeof restaurant?.rating === "number" && (
                        <span className={styles.rating}>{ratingLabel(restaurant.rating)} ★</span>
                    )}
                </h3>
                <p className={styles.rowMeta}>
                    {formatLongDate(reservation.date)} at {formatTime(reservation.date)}
                </p>
                {reservation.notes && <p className={styles.note}>{reservation.notes}</p>}
            </div>
            <div className={styles.rowSide}>
                <span>{reservation.partySize} Guests</span>
                <StatusBadge status={reservation.status} />
            </div>
        </div>
    );
}
