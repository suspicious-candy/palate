"use client"

import Link from "next/link";
import React from "react";
import {useRouter} from "next/navigation";
import axios from "axios"
import Image from "next/image";
import styles from "./onBoarding.module.css";
import { toast } from "react-hot-toast";
import { FOOD_CATEGORIES } from "../../lists/foodCategories";
import { safeNext, readNextParam } from "@/lib/safeNext";

/* Capitalised for the same reason as ListPage: lowercase means React does not
   see a component, the hooks rules go unchecked, and the React Compiler skips
   the whole file. The route folder stays "onBoarding" — the URL is unaffected. */
export default function OnBoarding(){

    const router = useRouter();

    const DIETS = [
    "Vegetarian", "Vegan", "Pescatarian", "Flexitarian",
    "Halal", "Kosher", "Jain",
    "Keto", "Paleo", "Low-carb", "Low-FODMAP",
    "Diabetic-friendly", "Low-sodium", "Gluten-free", "Dairy-free",
    ] as const;

    const ALLERGENS = [
    "Peanuts", "Tree nuts", "Milk", "Eggs", "Fish", "Shellfish",
    "Soy", "Wheat / gluten", "Sesame", "Mustard", "Celery",
    "Lupin", "Sulphites", "Mollusks",
    ] as const;

    const [userDiet, setuserDiet] = React.useState<string[]>([]);
    const [userAllergen, setuserAllergen] = React.useState<string[]>([]);
    const [userfood, setuserfood] = React.useState<{fsqid:number;name:string}[]>([]);
    const [saving, setSaving] = React.useState(false);

    /* No localStorage check. This used to read a `userId` the signup flow left
       behind and bounce to /signup if it was missing — but the server has never
       looked at it: the JWT cookie is what identifies the caller, and the
       preferences route decides for itself. Two sources of truth about whether
       you are signed in, and the weaker one held the door.

       It failed in both directions. A cleared localStorage (or a different
       browser, or a private window) threw a perfectly good session back to
       signup; and the stale string it left behind kept letting people through
       after logout, only for the request to 401. The 401 below is now the
       single answer, and it comes from the same place every other route gets
       it. */
    const savePreferences = async () => {
        try {
            setSaving(true);
            await toast.promise(
                // The server identifies the user from the JWT cookie, so we
                // don't send userId — it would just be ignored.
                axios.patch("/api/user/preferences", {
                    diet: userDiet,
                    allergines: userAllergen,
                    likedCuisines: userfood,
                }),
                {
                    loading: "Saving your preferences...",
                    success: "Preferences saved!",
                    error: (err) =>
                        err.response?.data?.error ?? "Could not save preferences",
                }
            );
            router.push(safeNext(readNextParam()));
        } catch (error: any) {
            /* Signed out. Carry the destination so signing in returns them here
               rather than dropping their picks — safeNext validates it on the
               way back, see lib/safeNext.ts for why an unvalidated `next` is an
               open redirect. */
            if (error?.response?.status === 401) {
                router.push("/login?next=/onBoarding");
                return;
            }
            // toast.promise already surfaced anything else; just log here.
            console.log("save preferences failed, " + error.message);
        } finally {
            setSaving(false);
        }
    };

    function toggleDiet(s: string) {
        setuserDiet(prev =>
            prev.includes(s) ? prev.filter(d => d !== s) : [...prev, s]
        );
    }
    function toggleAllergen(s: string) {
        setuserAllergen(prev =>
            prev.includes(s) ? prev.filter(a => a !== s) : [...prev, s]
        );
    }
    function toggleFood(f: { fsqid: number; name: string }) {
        setuserfood(prev =>
            prev.some(x => x.fsqid === f.fsqid)
                ? prev.filter(x => x.fsqid !== f.fsqid)
                : [...prev, f]
        );
    }

    return(
        <div className={styles.screen}>
            <div className={styles.card}>
                <div className={styles.header}>
                    <span className={styles.iconCircle}>
                        {/* A local static asset, so next/image is a straight win: it is served
                            optimised and with intrinsic dimensions. The avatar <img> tags
                            elsewhere deliberately are NOT converted — see next.config.ts. */}
                        <Image src="/pref.svg" alt="" width={28} height={28} />
                    </span>
                    <h1 className={styles.title}>Curate Your Palate</h1>
                    <p className={styles.subtitle}>
                        Tell us what you love, and we will craft the perfect dining
                        recommendations just for you.
                    </p>
                </div>

                <hr className={styles.rule} />

                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Dietary Needs</h2>
                    <div className={styles.chipGroup}>
                        {DIETS.map((d) => (
                            <button
                                key={d}
                                type="button"
                                className={`${styles.chip} ${userDiet.includes(d) ? styles.chipSelected : ""}`}
                                onClick={() => toggleDiet(d)}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                </div>

                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Allergens</h2>
                    {/* Said plainly, and deliberately BEFORE the chips rather
                        than under them. Allergens are stored on the profile but
                        nothing filters on them: they are free text compared
                        against cuisine names, so "Peanuts" could never match
                        "Thai Restaurant", and a filter that cannot fire would
                        look like allergen safety while providing none. Someone
                        picking "Shellfish" here would otherwise reasonably
                        assume the shortlist accounts for it. */}
                    <p className={styles.sectionNote}>
                        <i className="ph ph-info" />
                        Saved to your profile for reference — Palate does not filter
                        restaurants by allergen. Always check with the venue.
                    </p>
                    <div className={styles.chipGroup}>
                        {ALLERGENS.map((a) => (
                            <button
                                key={a}
                                type="button"
                                className={`${styles.chip} ${userAllergen.includes(a) ? styles.chipSelected : ""}`}
                                onClick={() => toggleAllergen(a)}
                            >
                                {a}
                            </button>
                        ))}
                    </div>
                </div>

                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Favourite Cuisines</h2>
                    <div className={styles.chipGroup}>
                        {(FOOD_CATEGORIES ?? []).map((f) => (
                            <button
                                key={f.fsqid}
                                type="button"
                                className={`${styles.chip} ${userfood.some(x => x.fsqid === f.fsqid) ? styles.chipSelected : ""}`}
                                onClick={() => toggleFood(f)}
                            >
                                {f.name}
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    type="button"
                    className={styles.save}
                    onClick={savePreferences}
                    disabled={saving}
                >
                    {saving ? "Saving..." : "Save & Continue"}
                </button>

                <Link href="/dashboard" className={styles.skip}>Skip for now</Link>
            </div>
        </div>
    )
}
