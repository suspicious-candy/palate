"use client";

import React from "react";
import Link from "next/link";
import axios from "axios";
import Nav from "@/components/Nav";
import styles from "./group.module.css";
import { useUser, type matching, type Restaurant } from "@/lib/userContext";
import { useReportGroupLocation } from "@/lib/useReportGroupLocation";
import { useTimeLeft } from "@/lib/timeLeft";
import { googleMapsUrl } from "@/lib/mapsUrl";
import { initials } from "@/lib/initials";
import timeAgo from "@/lib/timeAgo";
import {
    tally,
    totalCount,
    votedCount,
    votingClosesAt,
    votingDeadlinePassed,
} from "@/lib/groupVote";

/* Bill of Fare, the group screen. Three states driven by group.status — open
   (waiting on the organiser), voting (the ballot), closed (the winner) — plus
   an empty state for someone with no dinner coming up.

   The dashboard shows a one-line summary of the same group. This is the detail
   view, and the only place a member can actually approve anything. */

/* Deepest fill first, so the leader reads as the strongest mark on the page. */
const BAR_FILLS = ["#c1272d", "#e08a86", "#e7b3b0"];

/* Encouragement that scales with how many are ticked. The wording matters more
   than it looks: approval voting collapses into a plurality vote the moment
   people read the ballot as "pick your favourite", and a plurality vote is
   exactly what least-misery ranking was chosen to avoid. */
const FUN_LABELS: [number, string][] = [
    [0, "Tap the ones you'd be happy with"],
    [1, "Good start!"],
    [3, "Nice picks!"],
    [5, "Great taste!"],
    [7, "You're up for anything tonight!"],
];

function funLabel(n: number): string {
    let label = FUN_LABELS[0][1];
    for (const [min, text] of FUN_LABELS) if (n >= min) label = text;
    return label;
}

/** The server's own message when it sent one — those are written to tell the
 *  user what to do next ("Open the group once with location enabled"), and a
 *  generic "something went wrong" throws all of that away. */
function serverMessage(err: unknown, fallback: string): string {
    const e = err as { response?: { data?: { error?: string; message?: string } } };
    return e?.response?.data?.error ?? e?.response?.data?.message ?? fallback;
}

function restaurantMeta(r: Restaurant): string {
    const parts: string[] = [];
    if (r.cuisine?.length) parts.push(r.cuisine.slice(0, 2).join(", "));
    // rating is stored on the schema's 0-10 scale; show it the way people read stars.
    if (r.rating) parts.push(`★ ${(r.rating / 2).toFixed(1)}`);
    if (r.location?.locality) parts.push(r.location.locality);
    return parts.join(" · ");
}

export default function GroupPage() {
    const { user, refreshUser } = useUser();
    const group = user?.matchingGroup ?? null;

    /* A member may land here before ever opening the dashboard, and the search
       circle is anchored on the organiser's location. Idempotent per group. */
    useReportGroupLocation(group);

    const remaining = useTimeLeft(votingClosesAt(group));

    const [voteOpen, setVoteOpen] = React.useState(false);
    const [busy, setBusy] = React.useState<null | "start" | "vote" | "close" | "book">(null);
    const [error, setError] = React.useState<string | null>(null);
    const [busyRequest, setBusyRequest] = React.useState<string | null>(null);

    const me = group?.participants.find((p) => p.user?._id === user?._id) ?? null;
    const isAdmin = !!group?.admins?.some((a) => a._id === user?._id);
    const deadlinePassed = votingDeadlinePassed(group);

    /* The ballot is a DRAFT until submitted — one request on submit, not one per
       tap. The vote route replaces the whole approvals array, so per-tap writes
       would also work, but two quick taps can land out of order and leave the
       stored array reflecting the earlier one. */
    const [draft, setDraft] = React.useState<string[]>([]);

    /* Seeded when the sheet OPENS, not from an effect watching `voteOpen`.
       Seeding in an effect would render once with a stale ballot and again with
       the right one, and the lint rule that flags it is pointing at something
       real: this is an event, so it belongs in the handler.

       Seeded at all so that re-opening after voting shows the member's own
       picks — a blank ballot would read as "my vote was lost". */
    function openVoteSheet() {
        setDraft((me?.approvals ?? []).map((r) => r._id ?? "").filter(Boolean));
        setVoteOpen(true);
    }

    const rows = React.useMemo(() => tally(group), [group]);
    const maxVotes = rows[0]?.votes ?? 0;

    async function send(kind: "start" | "vote" | "close" | "book", path: string, body?: unknown) {
        setBusy(kind);
        setError(null);
        try {
            if (kind === "vote") await axios.put(path, body);
            else await axios.post(path, body);
            await refreshUser();
            return true;
        } catch (err) {
            setError(serverMessage(err, "That didn't work. Try again in a moment."));
            return false;
        } finally {
            setBusy(null);
        }
    }

    /* A sibling of send() rather than a call into it: send() owns the card-level
       `busy` flag, and routing a per-row action through it would grey out Start
       and Close while one person's request is in flight. The busy KEY is the
       target's id, so three queued people can be answered independently. */
    async function answerRequest(targetId: string, action: "approve" | "deny") {
        if (!group) return;
        setBusyRequest(targetId);
        setError(null);
        try {
            await axios.post(`/api/user/matching/${group._id}/requests`, { targetId, action });
            await refreshUser();
        } catch (err) {
            setError(serverMessage(err, "That didn't work. Try again in a moment."));
        } finally {
            /* finally, not the try block: a failed approval must release the row
               too, or the buttons stay disabled until a reload. */
            setBusyRequest(null);
        }
    }

    async function startVote() {
        if (!group) return;
        await send("start", `/api/user/matching/${group._id}/shortlist`);
    }

    /* Straight through send(): booking is card-level like starting and closing,
       and it takes no body — the route derives the restaurant, the time and the
       head count from the group rather than trusting anything sent here. */
    async function bookTable() {
        if (!group) return;
        await send("book", `/api/user/matching/${group._id}/reservation`);
    }

    async function submitVote() {
        if (!group) return;
        const ok = await send("vote", `/api/user/matching/${group._id}/vote`, {
            approvals: draft,
        });
        if (ok) setVoteOpen(false);
    }

    async function closeEarly() {
        if (!group) return;
        /* Closing early discards the ballots of anyone who has not voted. The
           route reports the number afterwards, but the same figure is derivable
           here — so ask before, not after. */
        const outstanding = totalCount(group) - votedCount(group);
        if (
            outstanding > 0 &&
            !window.confirm(
                `${outstanding} ${outstanding === 1 ? "person hasn't" : "people haven't"} voted yet. Close anyway?`
            )
        ) {
            return;
        }
        await send("close", `/api/user/matching/${group._id}/close`);
    }

    if (!user) {
        return (
            <div className={styles.page}>
                <Nav />
                <div className={styles.centered}>Loading…</div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <Nav user={user} />

            <div className={styles.layout}>
                <Link href="/dashboard" className={styles.back}>
                    <i className="ph-bold ph-arrow-left" />
                    Back to dashboard
                </Link>
                <h1 className={styles.title}>Your Group</h1>
                <p className={styles.subtitle}>
                    {"Who's coming, who's voted, and where it's headed."}
                </p>

                {group ? (
                    <GroupCard
                        group={group}
                        meVoted={!!me?.hasVoted}
                        isAdmin={isAdmin}
                        rows={rows}
                        maxVotes={maxVotes}
                        remaining={remaining}
                        deadlinePassed={deadlinePassed}
                        busy={busy}
                        busyRequest={busyRequest}
                        userId={user._id}
                        onStart={startVote}
                        onOpenVote={openVoteSheet}
                        onClose={closeEarly}
                        onAnswerRequest={answerRequest}
                        onBook={bookTable}
                    />
                ) : (
                    <div className={styles.empty}>
                        <div className={styles.emptyIcon}>
                            <i className="ph ph-users-three" />
                        </div>
                        <p className={styles.emptyTitle}>{"You're not in a group right now"}</p>
                        <p className={styles.emptyBody}>
                            Start one and get the crew voting on tonight&apos;s spot.
                        </p>
                        <Link href="/dashboard" className={styles.primaryBtn}>
                            Start a group dinner
                        </Link>
                    </div>
                )}

                {error ? <p className={styles.error}>{error}</p> : null}
            </div>

            {voteOpen && group ? (
                <VoteSheet
                    shortlist={group.restaurants}
                    draft={draft}
                    busy={busy === "vote"}
                    onToggle={(id) =>
                        setDraft((d) =>
                            d.includes(id) ? d.filter((x) => x !== id) : [...d, id]
                        )
                    }
                    onSubmit={submitVote}
                    onClose={() => setVoteOpen(false)}
                />
            ) : null}
        </div>
    );
}

function GroupCard({
    group,
    meVoted,
    isAdmin,
    rows,
    maxVotes,
    remaining,
    deadlinePassed,
    busy,
    busyRequest,
    userId,
    onStart,
    onOpenVote,
    onClose,
    onAnswerRequest,
    onBook,
}: {
    group: matching;
    meVoted: boolean;
    isAdmin: boolean;
    rows: { restaurant: Restaurant; votes: number }[];
    maxVotes: number;
    remaining: string;
    deadlinePassed: boolean;
    busy: null | "start" | "vote" | "close" | "book";
    busyRequest: string | null;
    userId: string;
    onStart: () => void;
    onOpenVote: () => void;
    onClose: () => void;
    onAnswerRequest: (targetId: string, action: "approve" | "deny") => void;
    onBook: () => void;
}) {
    const pillClass =
        group.status === "open"
            ? styles.pillOpen
            : group.status === "voting"
              ? styles.pillVoting
              : styles.pillClosed;

    /* `?? []` because pendingRequests is genuinely absent on every group created
       before the field was added — Mongoose applies defaults at CREATION only,
       so .lean() hands back undefined and .map() on it throws. The declared type
       says otherwise; the type describes data we control, not data that already
       exists. Same guard, same reason, as pendingOf() in lib/groupRequest.ts. */
    const pending = group.pendingRequests ?? [];

    return (
        <div className={styles.card}>
            <div className={styles.cardHead}>
                <span className={styles.groupName}>{group.name}</span>
                <span className={`${styles.pill} ${pillClass}`}>{group.status}</span>
            </div>

            <p className={styles.meta}>
                {new Date(group.date).toLocaleString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                })}
                {" · "}
                {votedCount(group)} of {totalCount(group)} voted
                {group.status === "voting" ? (
                    <> · {remaining ? `${remaining} left to vote` : "voting has closed"}</>
                ) : null}
            </p>

            <div className={styles.members}>
                {group.participants.map((p) => (
                    <div key={p.user?._id} className={styles.member}>
                        <div className={styles.avatarWrap}>
                            <div
                                className={`${styles.avatar} ${
                                    p.user?._id === userId ? styles.avatarYou : ""
                                }`}
                            >
                                {p.user?.profilePic ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        className={styles.avatarImg}
                                        src={p.user.profilePic}
                                        alt=""
                                    />
                                ) : (
                                    initials(p.user?.firstName, p.user?.lastName)
                                )}
                            </div>
                            {p.hasVoted ? (
                                <span className={styles.votedTick}>
                                    <i className="ph-bold ph-check" />
                                </span>
                            ) : null}
                        </div>
                        <span className={styles.memberName}>
                            {p.user?._id === userId
                                ? "You"
                                : (p.user?.firstName ?? p.user?.username)}
                        </span>
                    </div>
                ))}
            </div>

            {/* Admin-only, and the route answers 403 for anyone else — hiding it
                is so nobody is offered an action that will fail, not a security
                boundary. Sits with the members because it answers the same
                question: who is at this dinner.

                Strangers reach this queue by following a leaked invite link;
                friends of an admin are let straight in and never appear here.
                See lib/groupAdmission.ts. */}
            {isAdmin && pending.length > 0 ? (
                <>
                    <div className={styles.sectionLabel}>
                        WAITING TO JOIN · {pending.length}
                    </div>
                    <div className={styles.requests}>
                        {pending.map((r) => {
                            /* Keyed and busy-checked on the user id, never the
                               array index: answering one removes it mid-list and
                               shifts everything after it, so an index key would
                               move the spinner onto somebody else's row. */
                            const id = r.user?._id;
                            const waiting = busyRequest === id;
                            return (
                                <div key={id} className={styles.requestRow}>
                                    <div className={styles.requestAvatar}>
                                        {r.user?.profilePic ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                className={styles.avatarImg}
                                                src={r.user.profilePic}
                                                alt=""
                                            />
                                        ) : (
                                            initials(r.user?.firstName, r.user?.lastName)
                                        )}
                                    </div>

                                    <div className={styles.requestWho}>
                                        <span className={styles.requestName}>
                                            {[r.user?.firstName, r.user?.lastName]
                                                .filter(Boolean)
                                                .join(" ") || r.user?.username}
                                        </span>
                                        <span className={styles.requestMeta}>
                                            @{r.user?.username} · asked {timeAgo(r.requestedAt)}
                                        </span>
                                    </div>

                                    {/* `id &&` rather than a bare call: populate
                                        leaves user null for a deleted account,
                                        and answering with an undefined target
                                        would 400. */}
                                    <button
                                        className={styles.approveBtn}
                                        disabled={waiting || !id}
                                        onClick={() => id && onAnswerRequest(id, "approve")}
                                    >
                                        {waiting ? "…" : "Let them in"}
                                    </button>
                                    <button
                                        className={styles.denyBtn}
                                        disabled={waiting || !id}
                                        onClick={() => id && onAnswerRequest(id, "deny")}
                                    >
                                        Decline
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </>
            ) : null}

            {/* Once the vote is settled `winner` IS the source of truth — this is
                the one status where reading it rather than the tally is correct. */}
            {group.status === "closed" ? (
                <div className={styles.winnerRow}>
                    <i className="ph-fill ph-check-circle" />
                    {group.winner
                        ? `You're going to ${group.winner.name}`
                        : "The vote closed without a winner — nobody voted."}
                    {group.winner ? (
                        <a
                            className={styles.winnerLink}
                            href={googleMapsUrl(group.winner)}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Directions <i className="ph-bold ph-arrow-up-right" />
                        </a>
                    ) : null}
                </div>
            ) : null}

            {/* Only once a winner exists. A vote that closed with nobody voting
                has nothing to book, and the route answers 409 for exactly that —
                so there is no button to press. */}
            {group.status === "closed" && group.winner ? (
                group.reservation ? (
                    <div className={styles.bookedRow}>
                        <i className="ph-fill ph-calendar-check" />
                        <span>
                            Table booked for {group.reservation.partySize} ·{" "}
                            {new Date(group.reservation.date).toLocaleString("en-US", {
                                weekday: "short",
                                hour: "numeric",
                                minute: "2-digit",
                            })}
                        </span>
                        {/* Everyone in the group gets the booking on their own
                            account — the reservation carries all of them in
                            users[] — so this link is worth showing to members,
                            not just to whoever pressed the button. */}
                        <Link href="/reservation" className={styles.bookedLink}>
                            See it <i className="ph-bold ph-arrow-up-right" />
                        </Link>
                    </div>
                ) : isAdmin ? (
                    <div className={styles.bookRow}>
                        <span className={styles.bookHint}>
                            {"Booking adds the table to everyone's reservations."}
                        </span>
                        {/* Disabled while in flight: a second click loses the
                            compare-and-set on `reservation: null` and comes back
                            409 "another admin booked first" — which, when the
                            other admin is you, is a baffling thing to read. */}
                        <button
                            className={styles.primaryBtn}
                            onClick={onBook}
                            disabled={busy !== null}
                        >
                            {busy === "book" ? (
                                <>
                                    <i className="ph ph-circle-notch" /> Booking…
                                </>
                            ) : (
                                "Book the table"
                            )}
                        </button>
                    </div>
                ) : (
                    <p className={styles.note}>
                        <i className="ph ph-hourglass" /> Waiting on the organiser to book
                        the table.
                    </p>
                )
            ) : null}

            {group.restaurants.length > 0 ? (
                <>
                    <div className={styles.sectionLabel}>SHORTLIST</div>
                    <div className={styles.bars}>
                        {rows.map((row, i) => (
                            <div key={row.restaurant.fsqId}>
                                <div className={styles.barHead}>
                                    <a
                                        className={styles.barName}
                                        href={googleMapsUrl(row.restaurant)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {row.restaurant.name}
                                    </a>
                                    <span className={styles.barVotes}>{row.votes}</span>
                                </div>
                                <div className={styles.track}>
                                    <div
                                        className={styles.fill}
                                        style={{
                                            /* 4% so a zero-vote row still reads as a
                                               bar rather than an empty track. */
                                            width: `${maxVotes ? Math.round((row.votes / maxVotes) * 100) : 4}%`,
                                            background:
                                                BAR_FILLS[Math.min(i, BAR_FILLS.length - 1)],
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            ) : null}

            <div className={styles.actions}>
                {/* Admin-only, and the server enforces it with a 403 — hiding the
                    button is so nobody is shown an action that will fail, not a
                    security boundary. Disabled while in flight because a second
                    click loses the compare-and-set and returns a baffling 409. */}
                {group.status === "open" && isAdmin ? (
                    <button
                        className={styles.primaryBtn}
                        onClick={onStart}
                        disabled={busy !== null}
                    >
                        {busy === "start" ? (
                            <>
                                <i className="ph ph-circle-notch" /> Building the shortlist…
                            </>
                        ) : (
                            "Begin the voting"
                        )}
                    </button>
                ) : null}

                {group.status === "open" && !isAdmin ? (
                    <span className={styles.votedTag}>
                        <i className="ph ph-hourglass" /> Waiting on the organiser to pick the
                        shortlist
                    </span>
                ) : null}

                {group.status === "voting" && !meVoted && !deadlinePassed ? (
                    <button className={styles.primaryBtn} onClick={onOpenVote}>
                        Cast your vote
                    </button>
                ) : null}

                {group.status === "voting" && meVoted ? (
                    <>
                        <span className={styles.votedTag}>
                            <i className="ph-bold ph-check-circle" /> {"You're in — vote cast"}
                        </span>
                        {!deadlinePassed ? (
                            <button className={styles.ghostBtn} onClick={onOpenVote}>
                                Change your picks
                            </button>
                        ) : null}
                    </>
                ) : null}

                {group.status === "voting" && isAdmin ? (
                    <button
                        className={styles.ghostBtn}
                        onClick={onClose}
                        disabled={busy !== null}
                    >
                        {busy === "close" ? "Closing…" : "Close voting"}
                    </button>
                ) : null}
            </div>

            {group.status === "voting" && deadlinePassed ? (
                <p className={styles.note}>
                    Voting has closed. The winner appears as soon as anyone opens the group.
                </p>
            ) : null}
        </div>
    );
}

function VoteSheet({
    shortlist,
    draft,
    busy,
    onToggle,
    onSubmit,
    onClose,
}: {
    shortlist: Restaurant[];
    draft: string[];
    busy: boolean;
    onToggle: (id: string) => void;
    onSubmit: () => void;
    onClose: () => void;
}) {
    /* Escape closes. The listener is on the document so it works wherever focus
       happens to sit inside the sheet. */
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const approved = draft.length;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div
                className={styles.sheet}
                role="dialog"
                aria-modal="true"
                aria-label="Cast your vote"
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.sheetHead}>
                    <div className={styles.sheetTitleRow}>
                        <span className={styles.sheetTitle}>Which of these sound good?</span>
                        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
                            <i className="ph-bold ph-x" />
                        </button>
                    </div>
                    {/* This sentence is the user-facing half of least-misery: it asks
                        for the set someone can live with, not their peak choice. */}
                    <div className={styles.sheetHint}>
                        Tap everything you&apos;d happily eat at tonight — the more the merrier.
                    </div>
                </div>

                <div className={styles.sheetBody}>
                    {shortlist.map((r) => {
                        const id = r._id ?? "";
                        const on = draft.includes(id);
                        return (
                            <div key={r.fsqId} className={styles.voteRow}>
                                <span className={styles.swatch} style={{ background: "#e0d3ca" }} />
                                <div className={styles.voteMain}>
                                    <div className={styles.voteName}>{r.name}</div>
                                    <div className={styles.voteMeta}>{restaurantMeta(r)}</div>
                                </div>
                                {/* Toggle, not a radio — more than one can be lit. */}
                                <button
                                    className={`${styles.toggle} ${on ? styles.toggleOn : ""}`}
                                    onClick={() => onToggle(id)}
                                    aria-pressed={on}
                                >
                                    <i className={on ? "ph-bold ph-check" : "ph ph-fork-knife"} />
                                    {on ? "I'm in!" : "I'd go here"}
                                </button>
                            </div>
                        );
                    })}
                </div>

                <div className={styles.sheetFoot}>
                    <div className={styles.progress}>
                        <div className={styles.dots}>
                            {shortlist.map((r, i) => (
                                <span
                                    key={r.fsqId}
                                    className={`${styles.dot} ${i < approved ? styles.dotOn : ""}`}
                                />
                            ))}
                        </div>
                        <span className={styles.funLabel}>{funLabel(approved)}</span>
                    </div>
                    {/* An empty ballot is a real answer — "none of these work for
                        me" — and the vote route accepts it, so this submits rather
                        than blocking. */}
                    <button className={styles.submitBtn} onClick={onSubmit} disabled={busy}>
                        {busy
                            ? "Sending…"
                            : approved === 0
                              ? "Skip for now"
                              : `Submit vote (${approved})`}
                    </button>
                </div>
            </div>
        </div>
    );
}
