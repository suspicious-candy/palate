"use client";

import React from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import styles from "./dashboard.module.css";

// First-name + last-name initials, e.g. "Maya Kapoor" -> "MK".
function initials(first?: string, last?: string): string {
    return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

type tip = { fsqTipId: string; text: string };
type participant = {
    user:User,
    hasVoted:boolean,
    rankedVotes: Restaurant[],
    votedAt:Date,
};
type matching = {
    name:string,
    participants:participant[],
    restaurants:Restaurant[],
    date:Date,
    status:string,
    winner:Restaurant,
};
type category = {
    fsqCategoryId: string;
    name: string;
    icon: { prefix: string; suffix: string };
};
type Restaurant = {
    fsqId: string;
    name: string;
    categories: category[];
    geocodes: { latitude: number; longitude: number };
    geo: { type: string; coordinates: number[] };
    rating: number;
    tips: tip[];
};

type User = {
    profilePic: string;
    firstName: string;
    lastName: string;
    visitedResturants: Restaurant[];
    wishlist: Restaurant[];
    preferences: {
        likedCuisines: { fsqid: number; name: string }[];
        disliked: string[];
        allergines: string[];
        diet: string[];
    };
    matchingGroup:{
        group:matching;
        isInMatching: false
    };
    friendlist:User[];
    lists:[Restaurant[]]
};

// Pure: how much time is left until `date`, formatted relative to `now`.
function timeLeft(date: Date, now: Date = new Date()): string {
    const diffMs = new Date(date).getTime() - now.getTime();

    if (diffMs <= 0) {
        return "Time's up";
    }

    const totalMinutes = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
}

function useTimeLeft(date: Date): string {
    const [now, setNow] = React.useState(() => new Date());

    React.useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(id);
    }, []);

    return timeLeft(date, now);
}

type GeoState =
    | { status: "loading" }
    | { status: "success"; latitude: number; longitude: number }
    | { status: "error"; message: string };

// Browser-only API (needs navigator), so this only ever runs client-side,
// after mount, inside the effect below.
function useGeolocation(): GeoState {
    const [state, setState] = React.useState<GeoState>({ status: "loading" });

    React.useEffect(() => {
        if (!("geolocation" in navigator)) {
            setState({ status: "error", message: "Geolocation is not supported by this browser" });
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setState({
                    status: "success",
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
            },
            (error) => {
                // error.code: 1 = permission denied, 2 = position unavailable, 3 = timeout
                setState({ status: "error", message: error.message || "Location permission denied" });
            },
            {
                enableHighAccuracy: false, // city-level precision is enough; avoids a slow GPS fix
                timeout: 10000,
                maximumAge: 5 * 60 * 1000, // reuse a fix from the last 5 minutes instead of re-prompting the OS
            }
        );
    }, []);

    return state;
}

function castedVotes(group?: matching): number {
    if (!group) return 0;
    let casted: number = 0;
    for (const userParticipant of group.participants) {
        if (userParticipant.hasVoted) {
            casted++;
        }
    }
    return casted;
}


export default function Dashboard() {
    const [user, setUser] = React.useState<User | null>(null);
    const [loading, setLoading] = React.useState(true);
    const geo = useGeolocation();
    const remaining = useTimeLeft(user?.matchingGroup?.group?.date ?? new Date());

    const formattedDate = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    React.useEffect(() => {
        toast
            .promise(axios.get("/api/user/dashboard"), {
                loading: "Fetching user",
                success: "User fetch successful",
                error: (err) => err.response?.data?.error ?? "fetch failed",
            })
            .then((res) => setUser(res.data.user ?? null))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const loaded = () => (
        <div className={styles.page}>
            <nav className={styles.nav}>
                <div className={styles.navInner}>
                    <span className={styles.brand}>Palate</span>
                    <div className={styles.navLinks}>
                        <span className={`${styles.navLink} ${styles.navLinkActive}`}>Home</span>
                        <span className={styles.navLink}>Discover</span>
                        <span className={styles.navLink}>Groups</span>
                        <span className={styles.navLink}>Activity</span>
                        <span className={styles.navLink}>Lists</span>
                    </div>
                    <div className={styles.navSpacer} />
                    <div className={styles.navAvatar}>
                        {initials(user?.firstName, user?.lastName)}
                    </div>
                </div>
            </nav>

            <div className={styles.layout}>
                <div className={styles.menuCard}>
                    <div className={styles.menuHeader}>
                        <p className={styles.eyebrow}>{"Tonight's Table"}</p>
                        {geo.status === "loading" && <p>📍 Getting your location…</p>}
                        {geo.status === "success" && (
                            <p>📍 {geo.latitude.toFixed(4)}, {geo.longitude.toFixed(4)}</p>
                        )}
                        {geo.status === "error" && <p>📍 {geo.message}</p>}
                        <h1 className={styles.menuTitle}>Where shall we eat?</h1>
                        <p className={styles.menuSubtitle}>
                            {formattedDate} · curated for {user?.firstName} &amp; the crew
                        </p>
                    </div>

                    {!user?.matchingGroup?.isInMatching ? (
                        <div className={styles.featureCard}>
                            <div className={styles.featureIcon}>⌗</div>
                            <div className={styles.featureBody}>
                                <p className={styles.eyebrow}>{"Tonight's Feature"}</p>
                                <h2 className={styles.featureName}>Start a Group Dinner</h2>
                                <p className={styles.featureDesc}>
                                    Share a QR, everyone swipes the same shortlist, Palate
                                    serves the winner.
                                </p>
                            </div>
                            <button className={styles.beginBtn}>Begin →</button>
                        </div>
                    ) : (
                        <div className={styles.section}>
                            <div className={styles.sectionHead}>
                                <span className={styles.numeral}>I.</span>
                                <h2 className={styles.sectionTitle}>Already on the table</h2>
                                <span className={styles.rule} />
                            </div>

                            {user?.matchingGroup?.group?.status === "open" ? (
                                <div className={styles.itemRow}>
                                    <div className={styles.itemMain}>
                                        <p className={styles.itemName}>
                                            {user?.matchingGroup?.group?.name}
                                            <span className={styles.itemTag}>— ready to vote</span>
                                        </p>
                                        <p className={styles.itemMeta}>
                                            {castedVotes(user?.matchingGroup?.group)} of{" "}
                                            {user?.matchingGroup?.group?.participants.length} have voted
                                            <span className={styles.dot}>·</span> {remaining}
                                        </p>
                                    </div>
                                    <button className={styles.ghostBtn}>Begin the voting</button>
                                </div>
                            ) : null}

                            {user?.matchingGroup?.group?.status === "voting" ? (
                                <div className={styles.itemRow}>
                                    <div className={styles.itemMain}>
                                        <p className={styles.itemName}>
                                            {user?.matchingGroup?.group?.name}
                                            <span className={styles.itemTag}>— a live vote</span>
                                        </p>
                                        <p className={styles.itemMeta}>
                                            <strong>{user?.matchingGroup?.group?.winner?.name}</strong> leads
                                            <span className={styles.dot}>·</span>
                                            {castedVotes(user?.matchingGroup?.group)} of{" "}
                                            {user?.matchingGroup?.group?.participants.length} have voted
                                            <span className={styles.dot}>·</span> {remaining}
                                        </p>
                                    </div>
                                    <button className={styles.ghostBtn}>Cast your vote</button>
                                </div>
                            ) : null}

                            {user?.matchingGroup?.group?.status === "closed" ? (
                                <div className={styles.itemRow}>
                                    <div className={styles.itemMain}>
                                        <p className={styles.itemName}>
                                            {user?.matchingGroup?.group?.name}
                                            <span className={styles.itemTag}>— you found the restaurant!</span>
                                        </p>
                                    </div>
                                    <button className={styles.ghostBtn}>Cast your vote</button>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>

                <aside>
                    <div className={styles.sideCard}>
                        <h3 className={styles.sideTitle}>At the table tonight</h3>
                        <p className={styles.sideSub}>
                            {user?.friendlist?.length ?? 0} friends available
                        </p>
                        {user?.friendlist?.map((f, index) => (
                            <div className={styles.friendRow} key={index}>
                                {f.profilePic ? (
                                    <img
                                        className={styles.friendAvatar}
                                        src={f.profilePic}
                                        alt={`${f.firstName} ${f.lastName}`}
                                    />
                                ) : (
                                    <span className={styles.friendAvatar}>
                                        {initials(f.firstName, f.lastName)}
                                    </span>
                                )}
                                <p className={styles.friendName}>
                                    {f.firstName} {f.lastName}
                                </p>
                            </div>
                        ))}
                        <button className={styles.inviteBtn}>+ Invite more</button>
                    </div>

                    <div className={styles.sideCard}>
                        <h3 className={styles.sideTitle}>Narrow it down</h3>
                        <div className={styles.chips}>
                            <button className={`${styles.chip} ${styles.chipActive}`}>Books tonight</button>
                            <button className={styles.chip}>Walkable</button>
                            <button className={styles.chip}>Veg-friendly</button>
                            <button className={styles.chip}>Under $$</button>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );

    const notloaded = () => (
        <div className={styles.loading}>
            <p>Setting the table…</p>
        </div>
    );

    return <div>{loading ? notloaded() : loaded()}</div>;
}
