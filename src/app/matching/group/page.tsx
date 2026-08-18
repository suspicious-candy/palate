"use client";

import React from "react";
import Link from "next/link";
import axios from "axios";
import Nav from "@/components/Nav";
import styles from "./groups.module.css";
import CreateGroupModal from "@/components/CreateGroupModal";
import { useUser, type GroupSummary } from "@/lib/userContext";
import { initials } from "@/lib/initials";
import { votedCount, totalCount, groupIsStale, votingClosesAt } from "@/lib/groupVote";
import { useTimeLeft } from "@/lib/timeLeft";

/* Every group you are in. The detail view — the ballot, the shortlist, the
   admin controls — lives at /matching/group/[groupId]; this is only the index.

   Before this page existed the whole feature could show exactly one group:
   `user.matchingGroup` is whichever dinner is soonest, so a second group was
   invisible until the first one went stale. */

/* Avatars shown before the row collapses into "+N". Four fits the row at the
   narrowest width the grid drops to without the name wrapping. */
const MAX_FACES = 4;

function whenLabel(date: string | Date): string {
    return new Date(date).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

export default function GroupsPage() {
    const { user, confirmed } = useUser();

    const [groups, setGroups] = React.useState<GroupSummary[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [createOpen, setCreateOpen] = React.useState(false);

    const load = React.useCallback(async () => {
        try {
            const res = await axios.get("/api/user/matching");
            setGroups(res.data.groups ?? []);
        } catch (err) {
            console.error(
                "[groups] fetch failed:",
                (err as { response?: { status?: number } })?.response?.status
            );
        } finally {
            setLoading(false);
        }
    }, []);

    /* eslint-disable-next-line react-hooks/set-state-in-effect --
       the rule cannot see through the await: every setState in `load` runs
       after the network round trip, in a later microtask, which is the
       callback shape the rule's own guidance describes as fine. Inlining a
       .then() here would satisfy it statically at the cost of a second copy of
       the fetch, since the create-group modal needs `load` as well. */
    React.useEffect(() => { load(); }, [load]);

    /* Split by groupIsStale rather than by `status`, and the difference is the
       whole reason that helper exists: nothing forces a group to ever reach
       "closed" — closeVote only runs when somebody loads a page — so a dinner
       from last month can still be sitting at "voting". Sorting by status would
       file it under Upcoming forever. The calendar is the honest test.

       The API sorts newest-first, which is right for Past and backwards for
       Upcoming, so Upcoming is reversed: the soonest dinner is the one you
       came here to act on. */
    const { upcoming, past } = React.useMemo(() => {
        const upcoming: GroupSummary[] = [];
        const past: GroupSummary[] = [];
        for (const g of groups) (groupIsStale(g) ? past : upcoming).push(g);
        return { upcoming: upcoming.reverse(), past };
    }, [groups]);

    return (
        <div className={styles.page}>
            <Nav user={user ?? undefined} />

            <div className={styles.layout}>
                <div className={styles.head}>
                    <div>
                        <h1 className={styles.title}>Your Groups</h1>
                        <p className={styles.subtitle}>
                            Every table you&apos;re part of, and the ones you&apos;ve sat at.
                        </p>
                    </div>
                    <button className={styles.newBtn} onClick={() => setCreateOpen(true)}>
                        <i className="ph-bold ph-plus" />
                        New group
                    </button>
                </div>

                {loading ? (
                    <div className={styles.centered}>Loading…</div>
                ) : groups.length === 0 ? (
                    <div className={styles.empty}>
                        <div className={styles.emptyIcon}>
                            <i className="ph ph-users-three" />
                        </div>
                        <p className={styles.emptyTitle}>{"You're not in a group yet"}</p>
                        <p className={styles.emptyBody}>
                            Start one and get the crew voting on tonight&apos;s spot.
                        </p>
                        <button className={styles.primaryBtn} onClick={() => setCreateOpen(true)}>
                            Start a group dinner
                        </button>
                    </div>
                ) : (
                    <>
                        {upcoming.length > 0 && (
                            <>
                                <div className={styles.sectionHead}>
                                    <h2 className={styles.sectionTitle}>Upcoming</h2>
                                    <span className={styles.rule} />
                                    <span className={styles.sectionCount}>{upcoming.length}</span>
                                </div>
                                {upcoming.map((g) => (
                                    <GroupRow key={g._id} group={g} userId={user?._id} />
                                ))}
                            </>
                        )}

                        {past.length > 0 && (
                            <>
                                <div className={styles.sectionHead}>
                                    <h2 className={styles.sectionTitle}>Past</h2>
                                    <span className={styles.rule} />
                                    <span className={styles.sectionCount}>{past.length}</span>
                                </div>
                                {past.map((g) => (
                                    <GroupRow key={g._id} group={g} userId={user?._id} past />
                                ))}
                            </>
                        )}
                    </>
                )}
            </div>

            {/* `confirmed` from context rather than a fresh /api/user/friends
                call — the provider already holds the same list. `load` and not
                a local push: the server assigns the invite code and the
                participant rows, so re-reading is what makes the new row real
                rather than a guess at what was stored. */}
            {createOpen && (
                <CreateGroupModal
                    friends={confirmed}
                    onClose={() => setCreateOpen(false)}
                    onCreated={load}
                />
            )}
        </div>
    );
}

function GroupRow({
    group,
    userId,
    past = false,
}: {
    group: GroupSummary;
    userId?: string;
    past?: boolean;
}) {
    const remaining = useTimeLeft(votingClosesAt(group));
    const faces = group.participants.slice(0, MAX_FACES);
    const overflow = group.participants.length - faces.length;
    /* `admins` is unpopulated on a summary — raw ObjectIds, which arrive as
       strings over JSON. Compared, never rendered. */
    const isAdmin = !!userId && group.admins.some((a) => String(a) === userId);

    const pillClass =
        group.status === "open"
            ? styles.pillOpen
            : group.status === "voting"
              ? styles.pillVoting
              : styles.pillClosed;

    /* One line that says what this group needs from YOU, which is the only
       reason to open it. Ordered by urgency, not by status: a live vote you
       have not cast beats every other message on the row. */
    let note: string;
    if (past && group.status === "closed" && group.winner) {
        note = `You went to ${group.winner.name}`;
    } else if (past) {
        note = "This dinner has passed";
    } else if (group.status === "open") {
        note = isAdmin ? "Pick the shortlist to start the vote" : "Waiting on the organiser";
    } else if (group.status === "voting") {
        const me = group.participants.find((p) => p.user?._id === userId);
        note = me?.hasVoted
            ? `Vote cast · ${remaining ? `${remaining} left` : "voting has closed"}`
            : "Your vote is needed";
    } else {
        note = group.winner ? `You're going to ${group.winner.name}` : "The vote closed without a winner";
    }

    return (
        <Link
            href={`/matching/group/${group._id}`}
            className={`${styles.row} ${past ? styles.rowPast : ""}`}
        >
            <div className={styles.rowMain}>
                <div className={styles.rowTop}>
                    <span className={styles.groupName}>{group.name}</span>
                    <span className={`${styles.pill} ${pillClass}`}>{group.status}</span>
                    {isAdmin && <span className={styles.organiserTag}>organiser</span>}
                </div>
                <p className={styles.rowMeta}>
                    {whenLabel(group.date)}
                    <span className={styles.dot}>·</span>
                    {votedCount(group)} of {totalCount(group)} voted
                </p>
                <p className={styles.rowNote}>{note}</p>
            </div>

            <div className={styles.faces}>
                {faces.map((p) => (
                    <span key={p.user?._id} className={styles.face} title={p.user?.username}>
                        {p.user?.profilePic ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className={styles.faceImg} src={p.user.profilePic} alt="" />
                        ) : (
                            initials(p.user?.firstName, p.user?.lastName)
                        )}
                    </span>
                ))}
                {overflow > 0 && <span className={styles.faceMore}>+{overflow}</span>}
            </div>

            <i className={`ph-bold ph-caret-right ${styles.chevron}`} />
        </Link>
    );
}
