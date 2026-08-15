"use client";

import React from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import styles from "./EditProfileModal.module.css";
import { useUser, type Address } from "@/lib/userContext";

/* One modal for both create and edit — `editing` decides which. Two components
   would mean two copies of the same seven inputs, and the pair would drift the
   moment a field is added. The only real differences are the verb, the HTTP
   method, and whether addressId rides along. */

type Draft = {
    label: "" | "Home" | "Office";
    aptNumber: string;
    streetAddress: string;
    city: string;
    state: string;
    country: string;
    pincode: string; // kept as a string; the input is text until it is sent
};

const EMPTY: Draft = {
    label: "",
    aptNumber: "",
    streetAddress: "",
    city: "",
    state: "",
    country: "",
    pincode: "",
};

function draftFrom(a: Address): Draft {
    return {
        label: a.label ?? "",
        aptNumber: a.address?.aptNumber ?? "",
        streetAddress: a.address?.streetAddress ?? "",
        city: a.address?.city ?? "",
        state: a.address?.state ?? "",
        country: a.address?.country ?? "",
        pincode: a.address?.pincode != null ? String(a.address.pincode) : "",
    };
}

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

    return data?.message ?? "Couldn't save that address.";
}

export default function AddressModal({
    editing,
    onClose,
}: {
    /** The address being edited, or null to create a new one. */
    editing: Address | null;
    onClose: () => void;
}) {
    const { refreshUser } = useUser();

    // Lazy initializer, not an effect: seeding in an effect renders once with
    // blank inputs and again with the real ones, losing anything typed between.
    const [draft, setDraft] = React.useState<Draft>(() =>
        editing ? draftFrom(editing) : EMPTY
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
        setBusy(true);
        setError(null);
        try {
            /* pincode is a NUMBER on the model, so an empty box must be omitted
               rather than sent as "" or NaN — both fail the schema. Number("")
               is 0, which would silently store a real postcode of zero, hence
               the explicit emptiness check rather than a truthiness one. */
            const pincode =
                draft.pincode.trim() === "" ? undefined : Number(draft.pincode);

            if (pincode !== undefined && !Number.isInteger(pincode)) {
                setError("Pincode must be a number.");
                return;
            }

            const payload = {
                streetAddress: draft.streetAddress.trim(),
                city: draft.city.trim(),
                state: draft.state.trim(),
                country: draft.country.trim(),
                // Optional fields are OMITTED when blank, never sent as "" —
                // the route's schema has no empty-string branch for them.
                ...(draft.aptNumber.trim() ? { aptNumber: draft.aptNumber.trim() } : {}),
                ...(pincode !== undefined ? { pincode } : {}),
                ...(draft.label ? { label: draft.label } : {}),
            };

            if (editing) {
                await axios.patch("/api/user/addresses", {
                    addressId: editing._id,
                    ...payload,
                });
            } else {
                await axios.post("/api/user/addresses", payload);
            }

            await refreshUser();
            onClose();
        } catch (err) {
            setError(readError(err));
        } finally {
            setBusy(false);
        }
    }

    return createPortal(
        <div className={styles.overlay} onClick={onClose}>
            <div
                className={styles.sheet}
                role="dialog"
                aria-modal="true"
                aria-label={editing ? "Edit address" : "Add address"}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.head}>
                    <div className={styles.titleRow}>
                        <span className={styles.title}>
                            {editing ? "Edit address" : "Add an address"}
                        </span>
                        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
                            <i className="ph-bold ph-x" />
                        </button>
                    </div>
                    <div className={styles.hint}>
                        Street, city, state and country are required.
                    </div>
                </div>

                <div className={styles.body}>
                    <div className={styles.label}>LABEL</div>
                    {/* The model's enum is exactly Home | Office, so this is a
                        select rather than a text box — a free-text label would
                        be rejected by the schema with no way for the user to
                        know which words are allowed. */}
                    <select
                        className={styles.input}
                        value={draft.label}
                        onChange={(e) => set("label", e.target.value as Draft["label"])}
                    >
                        <option value="">No label</option>
                        <option value="Home">Home</option>
                        <option value="Office">Office</option>
                    </select>

                    <div className={styles.row}>
                        <div className={styles.col}>
                            <div className={styles.label}>APT / UNIT</div>
                            <input
                                className={styles.input}
                                value={draft.aptNumber}
                                onChange={(e) => set("aptNumber", e.target.value)}
                                placeholder="4B"
                                maxLength={30}
                            />
                        </div>
                        <div className={styles.col}>
                            <div className={styles.label}>PINCODE</div>
                            {/* inputMode numeric, but a text input: type="number"
                                brings spinners and locale quirks for something
                                that is really a code, not a quantity. */}
                            <input
                                className={styles.input}
                                inputMode="numeric"
                                value={draft.pincode}
                                onChange={(e) => set("pincode", e.target.value)}
                                placeholder="110001"
                                maxLength={7}
                            />
                        </div>
                    </div>

                    <div className={styles.label}>STREET ADDRESS</div>
                    <input
                        className={styles.input}
                        value={draft.streetAddress}
                        onChange={(e) => set("streetAddress", e.target.value)}
                        placeholder="12 Connaught Place"
                        maxLength={120}
                    />

                    <div className={styles.row}>
                        <div className={styles.col}>
                            <div className={styles.label}>CITY</div>
                            <input
                                className={styles.input}
                                value={draft.city}
                                onChange={(e) => set("city", e.target.value)}
                                maxLength={80}
                            />
                        </div>
                        <div className={styles.col}>
                            <div className={styles.label}>STATE</div>
                            <input
                                className={styles.input}
                                value={draft.state}
                                onChange={(e) => set("state", e.target.value)}
                                maxLength={80}
                            />
                        </div>
                    </div>

                    <div className={styles.label}>COUNTRY</div>
                    <input
                        className={styles.input}
                        value={draft.country}
                        onChange={(e) => set("country", e.target.value)}
                        maxLength={80}
                    />

                    {error ? <p className={styles.error}>{error}</p> : null}
                </div>

                <div className={styles.foot}>
                    <button className={styles.cancelBtn} onClick={onClose} disabled={busy}>
                        Cancel
                    </button>
                    <button className={styles.saveBtn} onClick={save} disabled={busy}>
                        {busy ? "Saving…" : editing ? "Save changes" : "Add address"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
