"use client";

import React from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import styles from "./EditProfileModal.module.css";
import { useUser, type User } from "@/lib/userContext";

/* The six fields PATCH /api/user accepts. Kept in step with that route's Zod
   allowlist deliberately: a field added here but not there is silently dropped,
   and one added there but not here is simply uneditable. `username` and `email`
   are absent from both, for the reasons noted on argSchema. */
type Draft = {
    firstName: string;
    lastName: string;
    favDish: string;
    phone: string;
    profilePic: string;
    dob: string; // "YYYY-MM-DD", the format <input type="date"> speaks
};

/* A stored dob is midnight UTC, which is why profile/page.tsx formats it with
   timeZone: "UTC". Slicing the ISO string keeps that convention. Going through
   local getters would roll the date back a day for anyone west of Greenwich, so
   simply opening this modal and pressing Save would walk their birthday
   backwards one day at a time. */
function toDateInput(value: string | Date | undefined): string {
    if (!value) return "";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function draftFrom(user: User): Draft {
    return {
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        favDish: user.favDish ?? "",
        phone: user.phone ?? "",
        profilePic: user.profilePic ?? "",
        dob: toDateInput(user.dob),
    };
}

/** The route answers `{ error: fieldErrors, formErrors }`: fieldErrors keyed by
 *  field, formErrors for anything not attached to one, where a .strict()
 *  rejection lands. Reading only one of the two is how a 400 ends up displayed
 *  as an empty message. */
function readError(err: unknown): string {
    const data = (err as { response?: { data?: unknown } })?.response?.data as
        | { error?: unknown; formErrors?: string[]; message?: string }
        | undefined;

    if (typeof data?.error === "string") return data.error;

    const fieldErrors = data?.error as Record<string, string[] | undefined> | undefined;
    for (const messages of Object.values(fieldErrors ?? {})) {
        if (messages?.[0]) return messages[0];
    }
    if (data?.formErrors?.[0]) return data.formErrors[0];

    return data?.message ?? "Couldn't save your profile.";
}

export default function EditProfileModal({ onClose }: { onClose: () => void }) {
    const { user, refreshUser } = useUser();

    /* A lazy initializer rather than an effect. Seeding from an effect renders
       once with empty inputs and again with the real values, and any keystroke
       landing in between is discarded. Opening the modal is an event, so the
       state belongs in the initializer. */
    const [draft, setDraft] = React.useState<Draft>(() =>
        user ? draftFrom(user) : {
            firstName: "", lastName: "", favDish: "",
            phone: "", profilePic: "", dob: "",
        }
    );
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    function set<K extends keyof Draft>(field: K, value: Draft[K]) {
        setDraft((d) => ({ ...d, [field]: value }));
    }

    async function save() {
        if (!user) return;

        /* Sends only what changed. PATCH means "change these fields", and the
           route builds its $set from the keys actually present, so a diff here is
           what makes "absent means unchanged" true end to end rather than merely
           supported in principle.

           It also means a stray value the user never touched cannot be
           re-written on every save, which is what would eventually overwrite a
           field changed elsewhere. */
        const original = draftFrom(user);
        const patch: Record<string, string | null> = {};

        for (const key of Object.keys(draft) as (keyof Draft)[]) {
            const next = draft[key].trim();
            if (next === original[key].trim()) continue;

            /* A cleared date cannot be "", which will not cast to a Date. The
               route turns null into an $unset, while every other field clears
               with an empty string. */
            patch[key] = key === "dob" && next === "" ? null : next;
        }

        /* Nothing changed. Closing without a request is better than sending an
           empty body and rendering the 400 the route correctly answers with. */
        if (Object.keys(patch).length === 0) {
            onClose();
            return;
        }

        setBusy(true);
        setError(null);
        try {
            await axios.patch("/api/user", patch);
            await refreshUser();
            onClose();
        } catch (err) {
            setError(readError(err));
        } finally {
            setBusy(false);
        }
    }

    /* No `mounted` guard is needed: the profile page renders this only after a
       click, so it never runs during the server pass and document.body exists. */
    return createPortal(
        <div className={styles.overlay} onClick={onClose}>
            <div
                className={styles.sheet}
                role="dialog"
                aria-modal="true"
                aria-label="Edit profile"
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.head}>
                    <div className={styles.titleRow}>
                        <span className={styles.title}>Edit profile</span>
                        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
                            <i className="ph-bold ph-x" />
                        </button>
                    </div>
                    <div className={styles.hint}>
                        Leave a field empty to remove it. Your username and email can&apos;t be
                        changed here.
                    </div>
                </div>

                <div className={styles.body}>
                    <div className={styles.row}>
                        <div className={styles.col}>
                            <div className={styles.label}>FIRST NAME</div>
                            <input
                                className={styles.input}
                                value={draft.firstName}
                                onChange={(e) => set("firstName", e.target.value)}
                                maxLength={60}
                            />
                        </div>
                        <div className={styles.col}>
                            <div className={styles.label}>LAST NAME</div>
                            <input
                                className={styles.input}
                                value={draft.lastName}
                                onChange={(e) => set("lastName", e.target.value)}
                                maxLength={60}
                            />
                        </div>
                    </div>

                    <div className={styles.label}>FAVOURITE DISH</div>
                    <input
                        className={styles.input}
                        value={draft.favDish}
                        onChange={(e) => set("favDish", e.target.value)}
                        placeholder="Ramen"
                        maxLength={120}
                    />

                    <div className={styles.label}>PHONE</div>
                    {/* type="tel", not "number": a number input strips +, spaces
                        and leading zeros, which is exactly why the model stores
                        this as a string. maxLength mirrors the route's .max(32)
                        so the common case never round-trips to a 400. */}
                    <input
                        className={styles.input}
                        type="tel"
                        value={draft.phone}
                        onChange={(e) => set("phone", e.target.value)}
                        placeholder="+1 (555) 123-4567"
                        maxLength={32}
                    />

                    <div className={styles.label}>DATE OF BIRTH</div>
                    <input
                        className={styles.input}
                        type="date"
                        value={draft.dob}
                        onChange={(e) => set("dob", e.target.value)}
                        // The route refuses a future date, so stop it at the picker.
                        max={new Date().toISOString().slice(0, 10)}
                    />

                    <div className={styles.label}>PROFILE PICTURE URL</div>
                    <input
                        className={styles.input}
                        type="url"
                        value={draft.profilePic}
                        onChange={(e) => set("profilePic", e.target.value)}
                        placeholder="https://…"
                        maxLength={2048}
                    />

                    {error ? <p className={styles.error}>{error}</p> : null}
                </div>

                <div className={styles.foot}>
                    <button className={styles.cancelBtn} onClick={onClose} disabled={busy}>
                        Cancel
                    </button>
                    <button className={styles.saveBtn} onClick={save} disabled={busy}>
                        {busy ? "Saving…" : "Save changes"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
