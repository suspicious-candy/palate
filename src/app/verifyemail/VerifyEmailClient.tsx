"use client";

import React from "react";
import Link from "next/link";
import axios from "axios";
import styles from "./verify.module.css";

export default function VerifyEmailClient({ token }: { token: string }) {
    const [state, setState] = React.useState<"verifying" | "done" | "failed">(
        "verifying"
    );
    const [message, setMessage] = React.useState("");

    /* The token is single-use, so this effect must fire exactly once. React
       StrictMode (on by default in dev) mounts, unmounts and remounts every
       component, which would send the token twice: the first call spends it,
       the second finds nothing and flips the screen to "invalid" on an account
       that just verified successfully. The ref survives the remount; state
       would not. */
    const sent = React.useRef(false);

    React.useEffect(() => {
        if (sent.current) return;
        sent.current = true;

        axios
            .post("/api/user/verifyemail", { token })
            .then(() => setState("done"))
            .catch((error) => {
                setMessage(
                    error.response?.data?.error ?? "Could not verify this link."
                );
                setState("failed");
            });
    }, [token]);

    if (state === "verifying") {
        return (
            <>
                <h1 className={styles.title}>Verifying…</h1>
                <p className={styles.subtitle}>One moment.</p>
            </>
        );
    }

    if (state === "done") {
        return (
            <>
                <h1 className={styles.title}>You&apos;re verified</h1>
                <p className={styles.subtitle}>
                    Your email is confirmed. Welcome to Palate.
                </p>
                <Link href="/dashboard" className={styles.linkButton}>
                    Go to Palate
                </Link>
            </>
        );
    }

    return (
        <>
            <h1 className={styles.title}>Link didn&apos;t work</h1>
            <p className={styles.subtitle}>{message}</p>
            {/* Offered because a spent token and a bad token look identical from
                here — someone who simply clicked the link twice is already
                verified and just needs a way in. */}
            <Link href="/login" className={styles.linkButton}>
                Sign in
            </Link>
        </>
    );
}
