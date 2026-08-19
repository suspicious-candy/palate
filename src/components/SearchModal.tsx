"use client"
import React from "react"
import {createPortal} from "react-dom"
import { useHydrated } from "@/lib/useClientValue";
import styles from "./SearchModal.module.css";
import { useNearbyRestaurants } from "@/lib/nearbyRestuant";
import { useGeo } from "@/lib/GeolocationContext";
import Image from 'next/image';
import axios from "axios";
import { toast } from "react-hot-toast";
import { useTrackClick, useOpenReservation } from "@/lib/ReservationTracker";
import { googleMapsUrl } from "@/lib/mapsUrl";



type tip = { fsqTipId: string; text: string };
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
    location?: { formattedAddress?: string };
};

function fetchSearchResults(query: string, lat: number, lng: number): Promise<Restaurant[]> {
    const request = axios.get("/api/Restaurants/search", { params: { query, lat, lng } });

    return toast.promise(request, {
        loading: "Searching",
        success: "Got it",
        error: (err: any) => err.response?.data?.error ?? "Search failed",
    }).then((res) => res.data.restaurants ?? []);
}


export default function SearchModal({ onClose }: { onClose: () => void }){

    const geo = useGeo();
    const nearbyRestaurants = useNearbyRestaurants().slice(0, 3);

    const [searchResults, setSearchResults] = React.useState<Restaurant[]>([]);
    const [query, setQuery] = React.useState("");

    /* See lib/useClientValue.ts — the same question as the old mounted flag,
       answered one render earlier and without an effect. */
    const mounted = useHydrated();

    const inputRef = React.useRef<HTMLInputElement>(null)

    React.useEffect(() => { inputRef.current?.focus(); }, [mounted])

    /* The empty case is DERIVED below rather than written back into state.

       This used to call setSearchResults([]) inline whenever the query was
       cleared, which is a setState running synchronously inside an effect —
       an extra render pass every time someone deletes their query, and the
       pattern the React Compiler assumes is absent. Returning early leaves the
       previous results sitting in state, which is harmless because `results`
       ignores them unless the query is live. */
    React.useEffect(() => {
        if (!query.trim() || geo.status !== "success") return;

        const timeoutId = setTimeout(() => {
            fetchSearchResults(query, geo.latitude, geo.longitude)
                .then(setSearchResults)
                .catch(() => {});
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [query, geo]);

    if(!mounted){
        return null;
    }

    /* Stale results from a previous query are filtered out HERE rather than
       being cleared from state by the effect above. `geo.status === "success"`
       is part of the condition because that is exactly when the effect declines
       to fetch — without it, clearing the query would briefly show the results
       of the last one. */
    const shown =
        query.trim()
            ? (geo.status === "success" ? searchResults : [])
            : nearbyRestaurants;

    return(
        createPortal(
        <div className={styles.backdrop} onClick={onClose}>
            <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={(e)=>e.preventDefault()}>
                    <i className={`ph ph-magnifying-glass ${styles.searchIcon}`} />
                    <input
                        ref={inputRef}
                        className={styles.searchInput}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search restaurants…"
                    ></input>
            </form>
            <div>
                <div>
                    {shown.map((r,i)=>(<RestaurantCard key={r.fsqId} restaurant={r} index={i} />))}
                </div>
            </div>
            </div>
        </div>,
        document.body
    ));

}

const swatchClasses = [styles.swatchSage, styles.swatchBlush, styles.swatchSand];

function RestaurantCard({ restaurant,index }: { restaurant: Restaurant; index:number }){

    const Rest = restaurant;
    const track = useTrackClick();
    const openReservation = useOpenReservation();
    const icon = Rest.categories[0]?.icon;

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
                    <i className="ph ph-arrow-square-out" />
                </a>
            </div>
        </div>
    )
}
