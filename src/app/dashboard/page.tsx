"use client";

import React from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import styles from "./dashboard.module.css";
import Image from 'next/image';
import Nav from "@/components/Nav";
import { useGeo, GeoState } from "@/lib/GeolocationContext";
import { useNearbyRestaurants } from "@/lib/nearbyRestuant";
import { useUser, User, Restaurant } from "@/lib/userContext";
import { useTrackClick, useOpenReservation } from "@/lib/ReservationTracker";
import InviteModal from "@/components/InviteModal";
import { votedCount, totalCount, leader, votingClosesAt } from "@/lib/groupVote";
import { useReportGroupLocation } from "@/lib/useReportGroupLocation";
import { useTimeLeft } from "@/lib/timeLeft";
import { googleMapsUrl } from "@/lib/mapsUrl";
import { haversineMiles, type Point } from "@/lib/distance";
import Link from "next/link";
import CreateGroupModal from "@/components/CreateGroupModal";

/* googleMapsUrl and useTimeLeft moved to lib/ when the group page needed them:
   a page is not a module other screens should import from, and there were three
   copies of googleMapsUrl (here, reservation, SearchModal) already drifting. */

type FriendSummary = {
    _id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    profilePic?: string;
};

function initials(first?: string, last?: string): string {
    return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

/* How many rows section II shows before "show all". The list arriving from
   /api/Restaurants/nearby is 50 long and was rendered whole; if the taste
   ranking is worth anything the answer is near the top, and 50 rows asked the
   user to do the narrowing the recommender is supposed to have done. */
const VISIBLE_RECOMMENDATIONS = 6;

/* Chip thresholds, in miles. "Walkable" is deliberately generous — roughly a
   20 minute walk — because the geo fix below moved every distance on the card
   up by 1.6x and a tighter bound now returns almost nothing. */
const WALKABLE_MILES = 1;
const SHORT_DRIVE_MILES = 5;

/** [lng, lat] — the order lib/distance expects, built in one place. */
function pointOf(r: { geocodes: { latitude: number; longitude: number } }): Point {
    return [r.geocodes.longitude, r.geocodes.latitude];
}

/* Foursquare category names are shaped for a database, not a chip: the corpus
   is full of "Italian Restaurant" and "Pizza Place". Trim the noun so six of
   these fit on one row; the untrimmed name stays the filter value. */
function chipLabel(category: string): string {
    return category.replace(/\s+(Restaurant|Place|Joint|Spot)$/i, "");
}

export function toggleWishlist(rest: Restaurant, saved: boolean, setUser: React.Dispatch<React.SetStateAction<User | null>>){

   const request = saved
        ? axios.delete("/api/Restaurants/wishList", { data: { fsqId: rest.fsqId, name: rest.name } })
        : axios.patch("/api/Restaurants/wishList", { fsqId: rest.fsqId, name: rest.name });

   return toast.promise(request, {
        loading: saved ? "Removing from wishlist" : "Adding to wishlist",
        success: saved ? "Removed from wishlist" : "Added to wishlist",
        error: (err) => err.response?.data?.error ?? "Couldn't update wishlist",
   }).then(() => {
        setUser((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                wishlist: saved
                    ? prev.wishlist.filter((w) => w.fsqId !== rest.fsqId)
                    : [...prev.wishlist, rest],
            };
        });
   });

}

export function toggleLists(rest: Restaurant, inList: boolean, listName:string ,setUser: React.Dispatch<React.SetStateAction<User | null>>){

   const request = inList
        ? axios.delete("/api/Restaurants/lists", { data: { fsqId: rest.fsqId, restName: rest.name,listName:listName } })
        : axios.patch("/api/Restaurants/lists", { fsqId: rest.fsqId, restName: rest.name,listName:listName  });

   return toast.promise(request, {
        loading: inList ? `Removing from ${listName}` : `Adding to ${listName}`,
        success: inList ? `Removed from ${listName}` : `Added to ${listName}`,
        error: (err) => err.response?.data?.error ?? `Couldn't update ${listName}`,
   }).then(() => {
        setUser((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                lists: {
                    ...prev.lists,
                    [listName]: inList
                        ? prev.lists[listName].filter((w) => w.fsqId !== rest.fsqId)
                        : [...(prev.lists[listName] ?? []), rest],
                },
            };
        });
   });

}

export function handleList(addList:boolean,listName:string,setUser: React.Dispatch<React.SetStateAction<User | null>>){

    const request = addList
        ? axios.patch("/api/user/lists", { listName })
        : axios.delete("/api/user/lists", { data: { listName } });

    return toast.promise(request,{
        loading: addList ? `Adding  ${listName}` : `Removing  ${listName}`,
        success: addList ? `Added  ${listName}` : `Removed  ${listName}`,
        error: (err) => err.response?.data?.error ?? `Couldn't update you lists`,
    }).then(()=>{
        setUser((prev) => {
            if (!prev) return prev;
            if (addList) {
                return { ...prev, lists: { ...prev.lists, [listName]: [] } };
            }

            const { [listName]: _removed, ...remainingLists } = prev.lists;
             return { ...prev, lists: remainingLists };
        });
    })

}



export default function Dashboard() {
    const { user, setUser, loading, refreshUser } = useUser();
    const geo = useGeo();
    useReportGroupLocation(user?.matchingGroup ?? null)
    const group = user?.matchingGroup;
    /* Counts down to the VOTE deadline, not to dinner. `date` is when the table
       is booked; voting shuts VOTE_LEAD_MINUTES before that. */
    const remaining = useTimeLeft(votingClosesAt(group));
    /* Derived, not `group.winner` — that field stays null until the vote closes,
       so reading it mid-vote renders a blank name. */
    const front = leader(group);
    /* Only the organiser can start the vote — the shortlist route answers 403
       for anyone else — so the row should not offer them an action that fails. */
    const isGroupAdmin = !!group?.admins?.some((a) => a._id === user?._id);
    const nearbyRestaurants = useNearbyRestaurants();
    const [listEdit,setlistEdit] = React.useState(false);
    const [listName, setlistName] = React.useState("");
    const [inviteOpen, setInviteOpen] = React.useState(false);
    const [createGroupOpen, setCreateGroupOpen] = React.useState(false);
    const formattedDate = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });
    const [friends,setFriends] = React.useState<FriendSummary[]>([]);

    /* Narrowing state for section II. All three filters run in the BROWSER,
       over the 50 rows /api/Restaurants/nearby already sent — no refetch, so
       the chips are instant.

       That is exactly right for distance and wrong-ish for cuisine, and the
       difference is worth knowing. `$near` hands back a distance-ORDERED
       prefix of the 20km set, so the 50 nearest necessarily contain every
       walkable place: filtering them here gives the same answer the database
       would. Cuisine has no such property. If 2 of the 50 nearest are Thai we
       show 2, while the radius may hold 15 that `.limit(50)` cut — the chip
       under-reports and the user reads it as "barely any Thai near me". Moving
       cuisine into the Mongo query, BEFORE the limit, is the fix when the
       corpus gets dense enough for that to bite. */
    const [cuisine, setCuisine] = React.useState<string | null>(null);
    const [maxMiles, setMaxMiles] = React.useState<number | null>(null);
    const [newToMe, setNewToMe] = React.useState(false);
    const [showAll, setShowAll] = React.useState(false);

    React.useEffect(()=>{
        axios.get("/api/user/friends").then((res) => setFriends(res.data.confirmed ?? [])).catch(()=>setFriends([]));
    },[])

    const visitedIds = React.useMemo(
        () => new Set(user?.visitedResturants?.map((v) => v.fsqId) ?? []),
        [user?.visitedResturants]
    );

    /* Derived from what actually came back, never a hardcoded cuisine list — a
       chip that matches nothing is worse than no chip, and which cuisines
       exist depends entirely on where the user is standing. Ranked by how many
       places carry the category so the row leads with the useful cuts. */
    const cuisineOptions = React.useMemo(() => {
        const counts = new Map<string, number>();
        for (const r of nearbyRestaurants) {
            // Per restaurant, not per tag: a place listed as "Pizza Place"
            // twice must not count twice toward the ranking.
            for (const name of new Set((r.categories ?? []).map((c) => c.name))) {
                counts.set(name, (counts.get(name) ?? 0) + 1);
            }
        }
        /* Four, not five: measured in the 330px sidebar the card lives in,
           four cuisines plus the three fixed chips wrap to exactly three rows
           (117px). A fifth spills onto a fourth row that usually holds one
           lonely chip. Raise this only if the card moves somewhere wider. */
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([name]) => name);
    }, [nearbyRestaurants]);

    const filtered = React.useMemo(() => {
        return nearbyRestaurants.filter((r) => {
            if (cuisine && !(r.categories ?? []).some((c) => c.name === cuisine)) return false;
            if (newToMe && visitedIds.has(r.fsqId)) return false;
            /* Fail open when there is no fix. A denied or pending permission
               means no distance can be computed, and dropping every row would
               render an empty section that looks like "nothing near you"
               rather than "we don't know where you are". */
            if (maxMiles !== null && geo.status === "success") {
                const d = haversineMiles([geo.longitude, geo.latitude], pointOf(r));
                if (d > maxMiles) return false;
            }
            return true;
        });
    }, [nearbyRestaurants, cuisine, newToMe, maxMiles, visitedIds, geo]);

    const shown = showAll ? filtered : filtered.slice(0, VISIBLE_RECOMMENDATIONS);

    /* Every chip collapses the list back to six. Someone who expanded to all 50
       and then picked a cuisine is asking a new question; leaving `showAll` set
       means clearing that chip silently dumps them back into the 50-row wall
       this whole section exists to remove — and by then the "show fewer" button
       has been hidden for a while, so nothing explains it. */
    const setFilter = (apply: () => void) => { apply(); setShowAll(false); };

    const hasChips =
        geo.status === "success" || visitedIds.size > 0 || cuisineOptions.length > 0;
    const filtersActive = cuisine !== null || maxMiles !== null || newToMe;
    const clearFilters = () =>
        setFilter(() => { setCuisine(null); setMaxMiles(null); setNewToMe(false); });

    const loaded = () => (
        <div className={styles.page}>
            <Nav user={user ?? undefined} />

            <div className={styles.layout}>
                <div className={styles.menuCard}>
                    <div className={styles.menuHeader}>
                        <p className={styles.eyebrow}>{"Tonight's Table"}</p>
                        <h1 className={styles.menuTitle}>Where shall we eat?</h1>
                        <p className={styles.menuSubtitle}>
                            {formattedDate} · curated for {user?.firstName} &amp; the crew
                        </p>
                    </div>

                    {!group ? (
                        <div className={styles.section}>
                            <div className={styles.sectionHead}>
                                <span className={styles.numeral}>I.</span>
                                <h2 className={styles.sectionTitle}>{"Tonight's Feature"}</h2>
                                <span className={styles.rule} />
                            </div>

                            <div className={styles.itemRow}>
                                <div className={`${styles.itemIcon} ${styles.swatchBlush}`}><i className="ph ph-qr-code" /></div>
                                <div className={styles.itemMain}>
                                    <p className={styles.itemName}>Start a Group Dinner</p>
                                    <p className={styles.itemTag}>
                                        Share a QR, everyone swipes the same shortlist, Palate
                                        serves the winner.
                                    </p>
                                </div>
                                <button className={styles.beginBtn} onClick={() => setCreateGroupOpen(true)}>Begin <i className="ph-bold ph-arrow-right" /></button>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.section}>
                            <div className={styles.sectionHead}>
                                <span className={styles.numeral}>I.</span>
                                <h2 className={styles.sectionTitle}>Already on the table</h2>
                                <span className={styles.rule} />
                            </div>

                            {group?.status === "open" ? (
                                <div className={styles.itemRow}>
                                    <div className={`${styles.itemIcon} ${styles.swatchSage}`}><i className="ph ph-hourglass" /></div>
                                    <div className={styles.itemMain}>
                                        <p className={styles.itemName}>{group.name}</p>
                                        <p className={styles.itemTag}>
                                            {isGroupAdmin
                                                ? "pick the shortlist to start the vote"
                                                : "waiting on the organiser"}
                                        </p>
                                    </div>
                                    {/* An open group has an EMPTY shortlist — the pre-save hook forbids
                                        approving anything that is not on it — so this row used to report
                                        "0 of N voted" and a countdown for a vote that does not exist yet.
                                        Both were true statements about nothing, and together they read as
                                        a live vote nobody had joined. Say what is actually the case. */}
                                    <p className={styles.itemMeta}>
                                        {totalCount(group)} in the group
                                        <span className={styles.dot}>·</span>{" "}
                                        {new Date(group.date).toLocaleString("en-US", {
                                            weekday: "short",
                                            hour: "numeric",
                                            minute: "2-digit",
                                        })}
                                    </p>
                                    <Link href={`/matching/group/${group._id}`} className={`${styles.ghostBtn} ${styles.ghostLink}`}>
                                        {isGroupAdmin ? "Begin the voting" : "View group"}
                                    </Link>
                                </div>
                            ) : null}

                            {group?.status === "voting" ? (
                                <div className={styles.itemRow}>
                                    <div className={`${styles.itemIcon} ${styles.swatchBlush}`}><i className="ph ph-checks" /></div>
                                    <div className={styles.itemMain}>
                                        <p className={styles.itemName}>{group.name}</p>
                                        <p className={styles.itemTag}>a live vote</p>
                                    </div>
                                    <p className={styles.itemMeta}>
                                        {/* Nobody has voted yet means there is no leader — say so rather
                                            than rendering "  leads" with an empty name. */}
                                        {front ? (
                                            <>
                                                <strong>{front.restaurant.name}</strong> leads
                                                <span className={styles.dot}>·</span>
                                            </>
                                        ) : null}
                                        {votedCount(group)} of {totalCount(group)} voted
                                        <span className={styles.dot}>·</span>{" "}
                                        {remaining ? `${remaining} left to vote` : "voting has closed"}
                                    </p>
                                    <Link href={`/matching/group/${group._id}`} className={`${styles.ghostBtn} ${styles.ghostLink}`}>Cast your vote</Link>
                                </div>
                            ) : null}

                            {group?.status === "closed" ? (
                                <div className={styles.itemRow}>
                                    <div className={`${styles.itemIcon} ${styles.swatchSand}`}><i className="ph-fill ph-check-circle" /></div>
                                    <div className={styles.itemMain}>
                                        <p className={styles.itemName}>{group.name}</p>
                                        <p className={styles.itemTag}>
                                            {group.winner
                                                ? `you're going to ${group.winner.name}`
                                                : "the vote closed without a winner"}
                                        </p>
                                    </div>
                                    {/* Once the vote is settled `winner` IS the source of truth — this
                                        is the one status where reading it is correct. */}
                                    {group.winner ? (
                                        <a
                                            className={`${styles.ghostBtn} ${styles.ghostLink}`}
                                            href={googleMapsUrl(group.winner)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            Get directions
                                        </a>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    )}
                    <div className={styles.section}>
                        <div className={styles.sectionHead}>
                            <span className={styles.numeral}>II.</span>
                            <h2 className={styles.sectionTitle}>Recommended for you</h2>
                            <span className={styles.rule} />
                            <span className={styles.itemTag}>tap <i className="ph ph-heart" /> to save</span>
                        </div>
                        {shown.map((r, i) => (
                            <RestaurantCard key={r.fsqId} restaurant={r} geo={geo} user={user} setUser={setUser} index={i} />
                        ))}

                        {/* Distinguishes "your filters match nothing" from the
                            empty list you get before geolocation resolves —
                            they look identical otherwise, and only one of them
                            is something the user can act on. */}
                        {nearbyRestaurants.length > 0 && filtered.length === 0 && (
                            <p className={styles.emptyFilter}>
                                Nothing matches those filters.{" "}
                                <button
                                    type="button"
                                    className={styles.clearFilters}
                                    onClick={clearFilters}
                                >
                                    Clear them
                                </button>
                            </p>
                        )}

                        {filtered.length > VISIBLE_RECOMMENDATIONS && (
                            <button
                                type="button"
                                className={styles.showAllBtn}
                                onClick={() => setShowAll((v) => !v)}
                            >
                                {showAll
                                    ? "Show fewer"
                                    : `Show all ${filtered.length} nearby`}
                            </button>
                        )}
                    </div>
                    <div className={styles.section}>
                        <div className={styles.sectionHead}>
                            <span className={styles.numeral}>III.</span>
                            <h2 className={styles.sectionTitle}>From your lists</h2>
                            <span className={styles.rule} />
                            {listEdit ?
                                <button className={`${styles.editToggleBtn} ${styles.editToggleBtnActive}`} onClick={()=>{setlistEdit(!listEdit)}}>Done</button>
                                :<button className={styles.editToggleBtn} onClick={()=>{setlistEdit(!listEdit)}}>Edit</button>
                            }
                            
                        </div>
                        {listEdit ? 
                            <div>
                                <form
                                    className={styles.newListForm}
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        if (!listName.trim()) return;
                                        handleList(true, listName, setUser);
                                        setlistName("");
                                    }}
                                >
                                    <input
                                        className={styles.newListInput}
                                        value={listName}
                                        onChange={(e) => setlistName(e.target.value)}
                                        placeholder="New list name"
                                    />
                                    <button type="submit" className={styles.newListBtn}>Add</button>
                                </form>

                                {Object.entries(user?.lists ?? {}).map(([name, restaurants]) => (
                                    <EditedListCard key={name} name={name} restaurants={restaurants} setUser={setUser} />
                                ))}
                            </div>
                            :
                            
                            Object.entries(user?.lists ?? {}).map(([name, restaurants]) => (
                                <LoadedListCard key={name} name={name} restaurants={restaurants} />
                            ))
                            
                        }
                    </div>
                </div>

                <aside>
                    <div className={styles.sideCard}>
                        <h3 className={styles.sideTitle}>At the table tonight</h3>
                        <p className={styles.sideSub}>
                            {friends.length} {friends.length === 1 ? "friend" : "friends"} available
                        </p>
                        {friends.map((f) => (
                            <FriendCard key={f._id} friend={f} />
                        ))}
                        <button
                            className={styles.inviteBtn}
                            onClick={() => setInviteOpen(true)}
                        >
                            + Invite more
                        </button>
                    </div>

                    {/* The chips live here rather than above the list they
                        filter, which costs them their adjacency — you can no
                        longer see a chip and its effect in one glance, and on
                        a narrow screen the sidebar drops BELOW the results
                        entirely. The count line is what pays that back: it is
                        the only remaining feedback that a chip did anything,
                        so it states the filtered total against the unfiltered
                        one rather than just labelling the card. */}
                    {hasChips && (
                        <div className={styles.sideCard}>
                            <h3 className={styles.sideTitle}>Narrow it down</h3>
                            <p className={styles.sideSub}>
                                {filtersActive
                                    ? `${filtered.length} of ${nearbyRestaurants.length} spots`
                                    : `${nearbyRestaurants.length} spots nearby`}
                            </p>

                            <div className={styles.chips}>
                                {/* Only offered once we can actually measure —
                                    these chips are unanswerable without a fix. */}
                                {geo.status === "success" && (
                                    <>
                                        <Chip
                                            label="Walkable"
                                            active={maxMiles === WALKABLE_MILES}
                                            onClick={() => setFilter(() => setMaxMiles((m) => (m === WALKABLE_MILES ? null : WALKABLE_MILES)))}
                                        />
                                        <Chip
                                            label="Short drive"
                                            active={maxMiles === SHORT_DRIVE_MILES}
                                            onClick={() => setFilter(() => setMaxMiles((m) => (m === SHORT_DRIVE_MILES ? null : SHORT_DRIVE_MILES)))}
                                        />
                                    </>
                                )}
                                {/* A first-time diner has nothing to exclude, so
                                    the chip would be a no-op control. */}
                                {visitedIds.size > 0 && (
                                    <Chip
                                        label="New to me"
                                        active={newToMe}
                                        onClick={() => setFilter(() => setNewToMe((v) => !v))}
                                    />
                                )}
                                {cuisineOptions.map((c) => (
                                    <Chip
                                        key={c}
                                        label={chipLabel(c)}
                                        active={cuisine === c}
                                        onClick={() => setFilter(() => setCuisine((cur) => (cur === c ? null : c)))}
                                    />
                                ))}
                            </div>

                            {filtersActive && (
                                <button className={styles.clearAllBtn} onClick={clearFilters}>
                                    Clear filters
                                </button>
                            )}
                        </div>
                    )}
                </aside>
            </div>

            {inviteOpen && (
                <InviteModal user={user} onClose={() => setInviteOpen(false)} />
            )}

            {/* refreshUser rather than a local patch: /api/user/dashboard is what
                attaches matchingGroup, so re-reading it is the only way the new
                group reaches every screen at once. Safe to call from an event
                handler — the loop risk is effects that depend on the object this
                replaces, not clicks. */}
            {createGroupOpen && (
                <CreateGroupModal
                    friends={friends}
                    onClose={() => setCreateGroupOpen(false)}
                    onCreated={refreshUser}
                />
            )}
        </div>
    );

    const notloaded = () => (
        <div className={styles.loading}>
            <p>Setting the table…</p>
        </div>
    );

    return <div>{loading ? notloaded() : loaded()}</div>;
}

const swatchClasses = [styles.swatchSage, styles.swatchBlush, styles.swatchSand];

/* aria-pressed, not aria-selected: each chip is an independent toggle the user
   can turn back off, which is what a screen reader needs to announce. */
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }){
    return (
        <button
            type="button"
            className={`${styles.chip} ${active ? styles.chipActive : ""}`}
            onClick={onClick}
            aria-pressed={active}
        >
            {label}
        </button>
    );
}

export function FriendCard({ friend }: { friend: FriendSummary }){
    const name =
        [friend.firstName, friend.lastName].filter(Boolean).join(" ") ||
        friend.username;

    return(
        <div className={styles.friendRow}>
            {friend.profilePic ? (
                <img
                    className={styles.friendAvatar}
                    src={friend.profilePic}
                    alt={name}
                />
            ) : (
                <span className={styles.friendAvatar}>
                    {initials(friend.firstName, friend.lastName)}
                </span>
            )}
            <p className={styles.friendName}>{name}</p>
        </div>
    );
}
export function RestaurantCard({ restaurant, geo, user, setUser, index }: { restaurant: Restaurant; geo: GeoState; user: User | null; setUser: React.Dispatch<React.SetStateAction<User | null>>; index: number }){
    const track = useTrackClick();
    const openReservation = useOpenReservation();
    const Rest = restaurant;
    const saved = user?.wishlist?.some((w) => w.fsqId === Rest.fsqId) ?? false;
    const icon = Rest.categories?.[0]?.icon;

    return(
        <div className={styles.restaurantRow}>
            <div className={`${styles.restaurantSwatch} ${swatchClasses[index % swatchClasses.length]}`}>
                {icon && (
                    <Image src={`${icon.prefix}64${icon.suffix}`} alt="" width={28} height={28} />
                )}
            </div>
            <div className={styles.restaurantMain}>
                <p className={styles.restaurantName}>{Rest.name}</p>
                
                <p className={styles.restaurantMeta}>
                    {Rest.categories.map((c) => c.name).join(", ")}
                </p>
            </div>
            <div className={styles.restaurantStats}>
                {Rest.rating > 0 && <span><i className={`ph-fill ph-star ${styles.starIcon}`} /> {Rest.rating.toFixed(1)}</span>}
                {geo.status === "success" && (
                    <span>
                        · {haversineMiles(
                            [geo.longitude, geo.latitude],
                            pointOf(Rest)
                        ).toFixed(1)} mi
                    </span>
                )}
            </div>
            <div className={styles.cardActions}>
                <button
                    className={styles.heartBtn}
                    onClick={() => openReservation({ fsqId: Rest.fsqId, name: Rest.name })}
                    aria-label={`Reserve a table at ${Rest.name}`}
                >
                    <i className="ph ph-calendar-plus" />
                </button>
                <a
                    href={googleMapsUrl(Rest)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.heartBtn}
                    aria-label={`View ${Rest.name} on Google Maps`}
                    onClick={() => track({ fsqId: Rest.fsqId, name: Rest.name })}
                >
                    <i className="ph ph-map-pin" />
                </a>
                <button
                    className={`${styles.heartBtn} ${saved ? styles.heartBtnActive : ""}`}
                    onClick={() => toggleWishlist(restaurant, saved, setUser)}
                    aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
                >
                    <i className={saved ? "ph-fill ph-heart" : "ph ph-heart"} />
                </button>
                <ListDropDown rest={Rest} user={user} setUser={setUser} />
            </div>
        </div>
    )
}

function LoadedListCard({ name, restaurants }: { name: string; restaurants: Restaurant[] }){
    return(
        <div className={styles.listRow}>
            <span className={styles.listName}>{name}</span>
            <span className={styles.listRule} />
            <span className={styles.listCount}>{restaurants.length} spots <i className="ph-bold ph-arrow-right" /></span>
        </div>
    )
}


function EditedListCard({ name, restaurants,setUser }: { name: string; restaurants: Restaurant[];setUser: React.Dispatch<React.SetStateAction<User | null>> }){
    return(
        <div className={styles.listRow}>
            <span className={styles.listName}>{name}</span>
            <span className={styles.listRule} />
            <button
                className={styles.removeListBtn}
                onClick={()=>handleList(false, name, setUser)}
                aria-label={`Remove ${name} list`}
            >
                <i className="ph ph-minus" />
            </button>
        </div>
    )
}

function ListDropDown({ rest, user, setUser }: { rest: Restaurant; user: User | null; setUser: React.Dispatch<React.SetStateAction<User | null>> }){

    const [isOpen, setIsOpen] = React.useState(false);
    const wrapRef = React.useRef<HTMLDivElement>(null);
    const [newListName, setNewListName] = React.useState("");

    React.useEffect(()=>{
        function onClickOutside(e:MouseEvent){
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown",onClickOutside);
        return()=>document.removeEventListener("mousedown",onClickOutside);
    },[]);

    const lists = Object.entries(user?.lists ?? {});

    return (
        <div className={styles.dropdownWrap} ref={wrapRef}>
            <button
                type="button"
                className={styles.listToggleBtn}
                onClick={() => setIsOpen((v) => !v)}
                aria-label="Save to a specific list"
            >
                <i className="ph ph-caret-down" />
            </button>
            {isOpen && (
                <div className={styles.listPopover}>
                    <p className={styles.listPopoverTitle}>Save to a list</p>
                    {lists.length !== 0 ? (
                        <div className={styles.listOptions}>
                            {lists.map(([name, restaurants]) => {
                                const inList = restaurants.some((r) => r.fsqId === rest.fsqId);
                                return (
                                    <button
                                        key={name}
                                        type="button"
                                        className={styles.listOption}
                                        onClick={() => toggleLists(rest, inList, name, setUser)}
                                    >
                                        <span>{name}</span>
                                        {inList && <span className={styles.listOptionCheck}><i className="ph-bold ph-check" /></span>}
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <p className={styles.listEmpty}>No lists added yet</p>
                    )}
                    <form
                        className={styles.newListForm}
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (!newListName.trim()) return;
                            handleList(true, newListName, setUser);
                            setNewListName("");
                        }}
                    >
                        <input
                            className={styles.newListInput}
                            value={newListName}
                            onChange={(e) => setNewListName(e.target.value)}
                            placeholder="New list name"
                        />
                        <button type="submit" className={styles.newListBtn}>Add</button>
                    </form>
                </div>
            )}
        </div>
    );

}