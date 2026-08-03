"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import axios from "axios";
import { toast } from "react-hot-toast";
import styles from "./FriendsModal.module.css";
import { useUser, type FriendSummary, type PendingReq } from "@/lib/userContext";
import { initials } from "@/lib/initials";

/* Largest unit first: the loop takes the first one the elapsed time clears,
   so 90 minutes reads "1 hour ago" rather than "90 minutes ago". */
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 24 * 60 * 60 * 1000],
    ["month", 30 * 24 * 60 * 60 * 1000],
    ["week", 7 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
];

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

// `requestedAt` crosses the wire as an ISO string — JSON has no date type.
function timeAgo(value: string | Date): string {
    const elapsed = Date.now() - new Date(value).getTime();
    for (const [unit, ms] of UNITS) {
        if (elapsed >= ms) return relative.format(-Math.floor(elapsed / ms), unit);
    }
    return "just now";
}

function displayName(person: FriendSummary): string {
    return (
        [person.firstName, person.lastName].filter(Boolean).join(" ") ||
        person.username
    );
}

/* One row, two uses: friends pass no children, requests pass the timestamp
   and the buttons. Keeps the avatar/name markup in one place while leaving
   the difference between the two lists visible at the call site. */
function PersonRow({
    person,
    children,
}: {
    person: FriendSummary;
    children?: React.ReactNode;
}) {
    return (
        <li className={styles.row}>
            {person.profilePic ? (
                <img src={person.profilePic} alt="" className={styles.avatarImg} />
            ) : (
                <span className={styles.avatar}>
                    {initials(person.firstName, person.lastName)}
                </span>
            )}

            <span className={styles.who}>
                <span className={styles.name}>{displayName(person)}</span>
                <span className={styles.username}>@{person.username}</span>
            </span>

            {children}
        </li>
    );
}

export default function FriendsModal({ onClose }: { onClose: () => void }) {
    const router = useRouter();
    const { user, pending, confirmed, refreshFriends, refreshUser } = useUser();

    /* Lazy initializer, deliberately not a useEffect: this is computed once on
       open. An effect would re-run when accepting the last request empties
       `pending`, yanking the user off the tab they are looking at. */
    const [tab, setTab] = React.useState<"friends" | "requests">(() =>
        pending.length > 0 ? "requests" : "friends"
    );
    const [busyId, setBusyId] = React.useState<string | null>(null);
    const [copied, setCopied] = React.useState(false);

    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    async function act(request: PendingReq, action: "accept" | "decline") {
        const username = request.user.username;
        // Per-row, not per-modal: a single flag would disable every other row.
        setBusyId(request._id);
        try {
            const res =
                action === "accept"
                    ? await axios.post("/api/user/friends", { identifier: username })
                    : await axios.delete(
                          `/api/user/friends?identifier=${encodeURIComponent(username)}`
                      );

            // The server already picked the wording via OUTCOME_MESSAGES.
            toast.success(res.data?.message ?? "Done");

            // One fetch fills both lists, so this updates Friends and Requests.
            await refreshFriends();
            if (action === "accept") await refreshUser();
        } catch (error: any) {
            if (error.response?.status === 401) {
                router.push("/login");
                return;
            }
            toast.error(error.response?.data?.error ?? "Something went wrong");
        } finally {
            setBusyId(null);
        }
    }

    async function copyInvite() {
        if (!user?.username) return;
        try {
            await navigator.clipboard.writeText(
                `${window.location.origin}/add/${user.username}`
            );
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Could not copy the link");
        }
    }

    /* No `mounted` guard: Nav renders this only when inboxOpen is true, which
       can only happen after a click, so it never runs during server render and
       document.body is always there. */
    return createPortal(
        <div className={styles.overlay} onClick={onClose}>
            <div
                className={styles.modal}
                role="dialog"
                aria-modal="true"
                aria-label="Friends"
                onClick={(e) => e.stopPropagation()}
            >
                <button className={styles.close} onClick={onClose} aria-label="Close">
                    ✕
                </button>

                <h1 className={styles.title}>Friends</h1>

                <div className={styles.tabs}>
                    <button
                        type="button"
                        className={`${styles.tab} ${tab === "friends" ? styles.tabActive : ""}`}
                        aria-pressed={tab === "friends"}
                        onClick={() => setTab("friends")}
                    >
                        Friends
                        {confirmed.length > 0 && (
                            <span className={styles.tabCount}>{confirmed.length}</span>
                        )}
                    </button>
                    <button
                        type="button"
                        className={`${styles.tab} ${tab === "requests" ? styles.tabActive : ""}`}
                        aria-pressed={tab === "requests"}
                        onClick={() => setTab("requests")}
                    >
                        Requests
                        {pending.length > 0 && (
                            <span className={styles.tabCount}>{pending.length}</span>
                        )}
                    </button>
                </div>

                {tab === "friends" ? (
                    confirmed.length === 0 ? (
                        <div className={styles.empty}>
                            <p className={styles.emptyTitle}>No friends yet</p>
                            <p className={styles.emptyText}>
                                Share your invite link — whoever opens it can add you in one
                                tap.
                            </p>
                            <button
                                type="button"
                                className={styles.inviteButton}
                                onClick={copyInvite}
                                disabled={!user?.username}
                            >
                                {copied ? "Copied" : "Copy invite link"}
                            </button>
                        </div>
                    ) : (
                        <ul className={styles.list}>
                            {confirmed.map((person) => (
                                /* Keyed by id, never by index: accepting a request removes
                                   an item mid-list and shifts everything after it. */
                                <PersonRow key={person._id} person={person} />
                            ))}
                        </ul>
                    )
                ) : pending.length === 0 ? (
                    <div className={styles.empty}>
                        <p className={styles.emptyTitle}>No friend requests right now</p>
                        <p className={styles.emptyText}>
                            When someone asks to be your friend, they&apos;ll show up here.
                        </p>
                    </div>
                ) : (
                    <ul className={styles.list}>
                        {pending.map((request) => (
                            <PersonRow key={request._id} person={request.user}>
                                <span className={styles.actions}>
                                    <span className={styles.time}>
                                        {timeAgo(request.requestedAt)}
                                    </span>
                                    <button
                                        type="button"
                                        className={styles.accept}
                                        disabled={busyId === request._id}
                                        onClick={() => act(request, "accept")}
                                    >
                                        Accept
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.decline}
                                        disabled={busyId === request._id}
                                        onClick={() => act(request, "decline")}
                                    >
                                        Decline
                                    </button>
                                </span>
                            </PersonRow>
                        ))}
                    </ul>
                )}
            </div>
        </div>,
        document.body
    );
}
