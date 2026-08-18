"use client";

import React from "react";
import axios from "axios";
import styles from "./CreateGroupModal.module.css";
import { initials } from "@/lib/initials";
import { VOTE_LEAD_MINUTES } from "@/lib/groupVote";

/* Declared structurally rather than reusing userContext's FriendSummary. That
   type is Pick<User, …>, so it claims profilePic, firstName and lastName are
   always present, whereas /api/user/friends selects them and a user who never
   set an avatar simply has none. Optional here matches what actually arrives. */
type Friend = {
    _id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    profilePic?: string;
};

/* The only way into the whole group feature. Without it both empty states —
   "Start a Group Dinner" on the dashboard and the groups tab's own empty
   state — point at each other and nothing can be created. */

/* POST /api/user/matching refuses a dinner less than VOTE_LEAD_MINUTES + 60
   away, because voting closes VOTE_LEAD_MINUTES before the table and a group
   born inside that window has no usable voting period. Defaulting past it means
   the common case never sees that error at all. */
const MIN_LEAD_MINUTES = VOTE_LEAD_MINUTES + 60;
const DEFAULT_LEAD_MINUTES = MIN_LEAD_MINUTES + 30;

/** Local date and time strings for the two inputs, defaulted far enough ahead
 *  to satisfy the server's lead-time rule.
 *
 *  Built from local getters rather than toISOString(). The inputs are local
 *  wall-clock and ISO is UTC, so anyone west of Greenwich would open the modal
 *  pre-filled with tomorrow's date. */
function defaultWhen(): { date: string; time: string } {
    const d = new Date(Date.now() + DEFAULT_LEAD_MINUTES * 60_000);
    d.setMinutes(d.getMinutes() > 30 ? 60 : 30, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
}

export default function CreateGroupModal({
    friends,
    onClose,
    onCreated,
}: {
    friends: Friend[];
    onClose: () => void;
    onCreated: () => void | Promise<void>;
}) {
    // An inline arrow, because the lint rule wants the memo's factory written at
    // the call site; a bare reference reads as a dependency-free constant.
    const initial = React.useMemo(() => defaultWhen(), []);
    const [name, setName] = React.useState("");
    const [date, setDate] = React.useState(initial.date);
    const [time, setTime] = React.useState(initial.time);
    const [picked, setPicked] = React.useState<string[]>([]);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    async function create() {
        setBusy(true);
        setError(null);
        try {
            /* new Date("YYYY-MM-DDTHH:MM") with no zone suffix parses as local
               time, which is what the two inputs mean. Appending "Z" or using
               Date.UTC here would silently shift the dinner by the user's
               offset. */
            const when = new Date(`${date}T${time}`);
            if (Number.isNaN(when.getTime())) {
                setError("Pick a date and a time.");
                return;
            }

            await axios.post("/api/user/matching", {
                name: name.trim() || undefined,
                date: when.toISOString(),
                friendsIds: picked,
            });
            await onCreated();
            onClose();
        } catch (err) {
            /* The route's own message where there is one. It explains the
               lead-time rule in terms of the vote, which no generic string can. */
            const e = err as {
                response?: { data?: { error?: unknown; message?: string } };
            };
            const detail = e?.response?.data?.error;
            setError(
                typeof detail === "string"
                    ? detail
                    : (e?.response?.data?.message ?? "Couldn't create the group.")
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div
                className={styles.sheet}
                role="dialog"
                aria-modal="true"
                aria-label="Start a group dinner"
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.head}>
                    <div className={styles.titleRow}>
                        <span className={styles.title}>Start a group dinner</span>
                        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
                            <i className="ph-bold ph-x" />
                        </button>
                    </div>
                    <div className={styles.hint}>
                        {"You'll be the admin — you can edit the shortlist and close the vote."}
                    </div>
                </div>

                <div className={styles.body}>
                    <div className={styles.label}>GROUP NAME</div>
                    <input
                        className={styles.input}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Friday Night Out"
                        maxLength={60}
                    />

                    <div className={styles.label}>WHEN</div>
                    <div className={styles.whenRow}>
                        <input
                            className={styles.dateInput}
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                        />
                        <input
                            className={styles.timeInput}
                            type="time"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                        />
                    </div>

                    <div className={styles.label}>INVITE PARTICIPANTS</div>
                    {friends.length === 0 ? (
                        <p className={styles.emptyFriends}>
                            No friends yet — add some first, or create the group and invite
                            them after.
                        </p>
                    ) : (
                        <div className={styles.friends}>
                            {friends.map((f) => {
                                const on = picked.includes(f._id);
                                return (
                                    <button
                                        key={f._id}
                                        type="button"
                                        className={`${styles.friendRow} ${on ? styles.friendRowOn : ""}`}
                                        aria-pressed={on}
                                        onClick={() =>
                                            setPicked((p) =>
                                                on ? p.filter((x) => x !== f._id) : [...p, f._id]
                                            )
                                        }
                                    >
                                        <span className={styles.avatar}>
                                            {f.profilePic ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    className={styles.avatarImg}
                                                    src={f.profilePic}
                                                    alt=""
                                                />
                                            ) : (
                                                initials(f.firstName, f.lastName)
                                            )}
                                        </span>
                                        <span className={styles.friendName}>
                                            {f.firstName
                                                ? `${f.firstName} ${f.lastName ?? ""}`.trim()
                                                : f.username}
                                        </span>
                                        <i
                                            className={
                                                on
                                                    ? `ph-bold ph-check-circle ${styles.tickOn}`
                                                    : `ph ph-circle ${styles.tickOff}`
                                            }
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {error ? <p className={styles.error}>{error}</p> : null}
                </div>

                <div className={styles.foot}>
                    <button className={styles.cancelBtn} onClick={onClose} disabled={busy}>
                        Cancel
                    </button>
                    <button className={styles.createBtn} onClick={create} disabled={busy}>
                        {busy ? "Creating…" : "Create group"}
                    </button>
                </div>
            </div>
        </div>
    );
}
