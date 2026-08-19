"use client";
import React from "react";
import { useGeo, GeoState } from "@/lib/GeolocationContext";
import { useUser, User, Restaurant } from "@/lib/userContext";
import { RestaurantCard, handleList } from "@/app/dashboard/page";
import Nav from "@/components/Nav";
import styles from "./lists.module.css";

/* Capitalised because React only treats a capitalised function as a component.
   Lowercase, it is an ordinary function that happens to call hooks: the linter
   cannot verify the rules of hooks inside it, and — since reactCompiler is on in
   next.config.ts — the compiler skips it entirely, so this page was silently
   getting none of the memoisation every other page gets. */
export default function ListPage() {
    const { user, setUser, loading } = useUser();
    const [isAdding, setIsAdding] = React.useState(false);
    const [listName, setListName] = React.useState("");
    const geo = useGeo();

    if (loading) {
        return <div className={styles.loading}>Getting your lists ready…</div>;
    }

    const wishlist = user?.wishlist ?? [];
    const lists = Object.entries(user?.lists ?? {});

    return (
        <div className={styles.page}>
            <Nav user={user ?? undefined} />

            <div className={styles.body}>
                <div className={styles.menuCard}>
                    <header className={styles.pageHeader}>
                    <h1 className={styles.pageTitle}>Your Lists</h1>
                    <p className={styles.pageSubtitle}>Everything you and the crew have saved.</p>
                </header>

                {/* Wishlist */}
                <section className={styles.section}>
                    <div className={styles.sectionHead}>
                        <h2 className={styles.sectionTitle}>Your Wishlist</h2>
                        <span className={styles.rule} />
                        <span className={styles.count}>
                            {wishlist.length} {wishlist.length === 1 ? "spot" : "spots"}
                        </span>
                    </div>
                    {wishlist.length === 0 ? (
                        <p className={styles.empty}>
                            Nothing wishlisted yet — tap the ♥ on any recommended restaurant.
                        </p>
                    ) : (
                        wishlist.map((r, i) => (
                            <RestaurantCard
                                key={r.fsqId}
                                restaurant={r}
                                geo={geo}
                                user={user}
                                setUser={setUser}
                                index={i}
                            />
                        ))
                    )}
                </section>

                {/* Custom Lists */}
                <section className={styles.section}>
                    <div className={styles.sectionHead}>
                        <h2 className={styles.sectionTitle}>Custom Lists</h2>
                        <span className={styles.rule} />
                        <button
                            className={`${styles.newListToggle} ${isAdding ? styles.newListToggleActive : ""}`}
                            onClick={() => setIsAdding(!isAdding)}
                        >
                            {isAdding ? "Done" : "New list"}
                        </button>
                    </div>

                    {isAdding && (
                        <form
                            className={styles.newListForm}
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (!listName.trim()) return;
                                handleList(true, listName, setUser);
                                setListName("");
                            }}
                        >
                            <input
                                className={styles.newListInput}
                                value={listName}
                                onChange={(e) => setListName(e.target.value)}
                                placeholder="New list name"
                                autoFocus
                            />
                            <button type="submit" className={styles.newListBtn}>
                                <i className="ph ph-plus" />Create
                            </button>
                        </form>
                    )}

                    {lists.length === 0 ? (
                        <p className={styles.empty}>
                            No custom lists yet — create one to start grouping your spots.
                        </p>
                    ) : (
                        <div className={styles.listStack}>
                            {lists.map(([name, restaurants]) => (
                                <Listcard
                                    key={name}
                                    name={name}
                                    restaurants={restaurants}
                                    geo={geo}
                                    user={user}
                                    setUser={setUser}
                                    isEditing={isAdding}
                                />
                            ))}
                        </div>
                    )}
                </section>
                </div>
            </div>
        </div>
    );
}

function Listcard({
    name,
    restaurants,
    geo,
    user,
    setUser,
    isEditing,
}: {
    name: string;
    restaurants: Restaurant[];
    user: User | null;
    setUser: React.Dispatch<React.SetStateAction<User | null>>;
    geo: GeoState;
    isEditing: boolean;
}) {
    return (
        <div className={styles.listCard}>
            <div className={styles.listCardHead}>
                <h3 className={styles.listCardName}>{name}</h3>
                <span className={styles.listCardSpacer} />
                <span className={styles.count}>
                    {restaurants.length} {restaurants.length === 1 ? "spot" : "spots"}
                </span>
                {isEditing && (
                    <button
                        className={styles.deleteListBtn}
                        onClick={() => handleList(false, name, setUser)}
                        aria-label={`Delete ${name} list`}
                    >
                        <i className="ph ph-trash" />
                    </button>
                )}
            </div>
            <div className={styles.listCardDivider} />
            {restaurants.length === 0 ? (
                <p className={styles.emptyTight}>
                    No spots yet — save a restaurant and add it to this list.
                </p>
            ) : (
                restaurants.map((r, i) => (
                    <RestaurantCard
                        key={r.fsqId}
                        restaurant={r}
                        geo={geo}
                        user={user}
                        setUser={setUser}
                        index={i}
                    />
                ))
            )}
        </div>
    );
}
