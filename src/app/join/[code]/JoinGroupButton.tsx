"use client"

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import { toast } from "react-hot-toast";
import styles from "./join.module.css";

export default function JoinGroupButton({ code }: { code: string }) {
    const router = useRouter();
    const [loading, setLoading] = React.useState(false);
    /* Three terminal states, not one. The API deliberately distinguishes being
       let in from being queued — that distinction IS the feature — so a single
       "done" flag would tell an auto-admitted friend their request is awaiting
       approval and leave them with nowhere to go. */
    const [result, setResult] = React.useState<null | "joined" | "pending">(null);

    const onJoin = async () => {
        setLoading(true);
        try {
            /* Key must be `inviteCode` — it is what the route's Zod schema
               names, and a mismatch is a 400 on every click. */
            const res = await axios.post("/api/user/matching/join", {
                inviteCode: code,
            });

            /* Branch on the body, not the status code. 200 covers both
               "admitted" and "already a participant", and both mean joined. */
            if (res.data?.state === "joined") {
                setResult("joined");
                toast.success("You're in");
            } else {
                setResult("pending");
                toast.success("Request sent to the organiser");
            }
        } catch (error: any) {
            /* Signed out. Bounce to signup carrying the destination, which
               safeNext validates on the way back — see lib/safeNext.ts for why
               an unvalidated `next` is an open redirect. encodeURIComponent
               because the code is user-supplied path input. */
            if (error.response?.status === 401) {
                router.push(`/signup?next=/join/${encodeURIComponent(code)}`);
                return;
            }
            toast.error(error.response?.data?.error ?? "Could not join this group");
        } finally {
            setLoading(false);
        }
    };

    if (result === "joined") {
        /* Deliberately NOT an automatic redirect to /matching/group. That page
           renders findActiveGroup, which returns the SOONEST non-stale dinner —
           not necessarily the one just joined. Someone who accepts an invite for
           next Friday while already holding a group tomorrow would be dropped
           onto tomorrow's group with no sign the join worked. A link they choose
           to follow cannot be wrong in that way. */
        return (
            <>
                <p className={styles.status}>You&apos;re in.</p>
                <Link href="/matching/group" className={styles.linkButton}>
                    Go to your group
                </Link>
            </>
        );
    }

    if (result === "pending") {
        return (
            <p className={styles.status}>
                Request sent — the organiser will let you know.
            </p>
        );
    }

    return (
        <button
            type="button"
            className={styles.button}
            onClick={onJoin}
            disabled={loading}
        >
            {loading ? "Joining…" : "Join this dinner"}
        </button>
    );
}
