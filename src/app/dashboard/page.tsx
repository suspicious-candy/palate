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
import { useTrackClick } from "@/lib/ReservationTracker";
import InviteModal from "@/components/InviteModal";
import { votedCount, totalCount, leader, votingClosesAt } from "@/lib/groupVote";

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

function timeLeft(date: Date | null, now: Date = new Date()): string {
    /* Null means there is no deadline to count down to — no group, or a group
       with no date yet. Rendering nothing is right; substituting `new Date()`
       would show "Time's up" to someone who has nothing to be late for. */
    if (!date) return "";

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

function useTimeLeft(date: Date | null): string {
    const [now, setNow] = React.useState(() => new Date());

    /* votingClosesAt() builds a fresh Date every render, so the object identity
       always differs. Keying the effect on the timestamp instead means the
       interval is only torn down when the deadline actually moves. */
    const deadline = date?.getTime() ?? null;

    React.useEffect(() => {
        if (deadline === null) return;
        const id = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(id);
    }, [deadline]);

    return timeLeft(date, now);
}


function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371; 
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
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



export function googleMapsUrl(r: Restaurant): string {
    const query = r.location?.formattedAddress
        ? `${r.name} ${r.location.formattedAddress}`
        : `${r.geocodes.latitude},${r.geocodes.longitude}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default function Dashboard() {
    const { user, setUser, loading } = useUser();
    const geo = useGeo();
    const group = user?.matchingGroup?.group;
    /* Counts down to the VOTE deadline, not to dinner. `date` is when the table
       is booked; voting shuts VOTE_LEAD_MINUTES before that. */
    const remaining = useTimeLeft(votingClosesAt(group));
    /* Derived, not `group.winner` — that field stays null until the vote closes,
       so reading it mid-vote renders a blank name. */
    const front = leader(group);
    const nearbyRestaurants = useNearbyRestaurants();
    const [listEdit,setlistEdit] = React.useState(false);
    const [listName, setlistName] = React.useState("");
    const [inviteOpen, setInviteOpen] = React.useState(false);
    const formattedDate = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });
    const [friends,setFriends] = React.useState<FriendSummary[]>([]);

    React.useEffect(()=>{
        axios.get("/api/user/friends").then((res) => setFriends(res.data.confirmed ?? [])).catch(()=>setFriends([]));
    },[])

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

                    {!user?.matchingGroup?.isInMatching ? (
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
                                <button className={styles.beginBtn}>Begin <i className="ph-bold ph-arrow-right" /></button>
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
                                        <p className={styles.itemTag}>ready to vote</p>
                                    </div>
                                    <p className={styles.itemMeta}>
                                        {votedCount(group)} of {totalCount(group)} voted
                                        <span className={styles.dot}>·</span> voting closes in {remaining}
                                    </p>
                                    <button className={styles.ghostBtn}>Begin the voting</button>
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
                                        <span className={styles.dot}>·</span> {remaining}
                                    </p>
                                    <button className={styles.ghostBtn}>Cast your vote</button>
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
                        {nearbyRestaurants.map((r, i) => (
                            <RestaurantCard key={r.fsqId} restaurant={r} geo={geo} user={user} setUser={setUser} index={i} />
                        ))}
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
                </aside>
            </div>

            {inviteOpen && (
                <InviteModal user={user} onClose={() => setInviteOpen(false)} />
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
                        · {haversineDistance(
                            geo.latitude,
                            geo.longitude,
                            Rest.geocodes.latitude,
                            Rest.geocodes.longitude
                        ).toFixed(1)} mi
                    </span>
                )}
            </div>
            <div className={styles.cardActions}>
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