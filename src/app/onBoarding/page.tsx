"use client"

import Link from "next/link";
import React from "react";
import {useRouter} from "next/navigation";
import axios from "axios"
import styles from "./onBoarding.module.css";
import { toast } from "react-hot-toast";
import { FOOD_CATEGORIES } from "../../lists/foodCategories";

export default function onBoarding(){

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

    const savePreferences = async () => {
        const userId =
            typeof window !== "undefined" ? localStorage.getItem("userId") : null;

        // Guard against the literal strings "undefined"/"null" that a bad
        // localStorage.setItem call can leave behind.
        if (!userId || userId === "undefined" || userId === "null") {
            toast.error("Please sign up first");
            router.push("/signup");
            return;
        }

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
            router.push("/dashboard");
        } catch (error: any) {
            // toast.promise already surfaced the error; just log here.
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
                        <img src="/pref.svg" alt="" />
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
