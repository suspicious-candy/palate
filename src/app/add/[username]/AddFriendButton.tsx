"use client"

import React from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { toast } from "react-hot-toast";
import styles from "./add.module.css";

export default function AddFriendButton({ username }: { username: string }) {
    const router = useRouter();
    const [loading, setLoading] = React.useState(false);
    const [done, setDone] = React.useState(false);

    const onAdd = async () => {
        setLoading(true);
        try {
            const res = await axios.post("/api/user/friends", { identifier: username });
            toast.success(res.data?.message ?? "Request sent");
            setDone(true);
        } catch (error: any) {
            // Not logged in yet: send them to sign up, then straight back here.
            if (error.response?.status === 401) {
                router.push(`/signup?next=/add/${encodeURIComponent(username)}`);
                return;
            }
            toast.error(error.response?.data?.error ?? "Could not add friend");
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            type="button"
            className={styles.button}
            onClick={onAdd}
            disabled={loading || done}
        >
            {done ? "Done" : loading ? "Sending..." : `Add ${username}`}
        </button>
    );
}
