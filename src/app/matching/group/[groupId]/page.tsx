"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import axios from "axios";
import Nav from "@/components/Nav";
import styles from "./group.module.css";
import { useUser, type matching, type Restaurant, type FriendSummary } from "@/lib/userContext";
import { useReportGroupLocation } from "@/lib/useReportGroupLocation";
import { useTimeLeft } from "@/lib/timeLeft";
import { googleMapsUrl } from "@/lib/mapsUrl";
import { initials } from "@/lib/initials";
import {
    groupIsStale,
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

/* "Riley N." — enough to recognise someone without handing their full name to
   every admin reviewing a queue. Falls back through last-initial, then first
   name alone, then the username, because a user may have set none of them. */
function shortName(u?: FriendSummary): string {
    const first = u?.firstName?.trim();
    const lastInitial = u?.lastName?.trim()?.[0];
    if (first && lastInitial) return `${first} ${lastInitial}.`;
    return first || u?.username || "Someone";
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
    const { user } = useUser();
    const { groupId } = useParams<{ groupId: string }>();

    /* Fetched by id rather than read off `user.matchingGroup`, which is the
       change that made this page work for more than one group: that field is
       whichever dinner is soonest, so every other group in the list would have
       opened showing the wrong one.

       `notFound` is a third state, distinct from `group === null` while
       loading. The route answers 404 both for a group that does not exist and
       for one the viewer is not in — deliberately indistinguishable — so the
       page can only say "not yours", never "wrong id". */
    const [group, setGroup] = React.useState<matching | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [notFound, setNotFound] = React.useState(false);

    /* Replaces refreshUser() at every action below. That refetched the whole
       dashboard payload to pick up one group's new status — and, worse, read
       back findActiveGroup, so acting on a group that was not the soonest
       refreshed a DIFFERENT group and the page appeared not to update. */
    const refreshGroup = React.useCallback(async () => {
        if (!groupId) return;
        try {
            const res = await axios.get(`/api/user/matching/${groupId}`);
            setGroup(res.data.group ?? null);
            setNotFound(false);
        } catch (err) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            if (status === 404) setNotFound(true);
            else console.error("[group] fetch failed:", status);
        } finally {
            setLoading(false);
        }
    }, [groupId]);

    /* eslint-disable-next-line react-hooks/set-state-in-effect --
       every setState in refreshGroup runs after the await, not synchronously,
       so there is no cascading render for the rule to prevent. It stays one
       awaitable function because send() below depends on that: the button's
       busy state has to survive until the refreshed group is actually in. */
    React.useEffect(() => { refreshGroup(); }, [refreshGroup]);

    /* A member may land here before ever opening the dashboard, and the search
       circle is anchored on the organiser's location. Idempotent per group. */
    useReportGroupLocation(group);

    const remaining = useTimeLeft(votingClosesAt(group));

    const [voteOpen, setVoteOpen] = React.useState(false);
    const [busy, setBusy] = React.useState<null | "start" | "vote" | "close" | "book" | "lock">(null);
    const [error, setError] = React.useState<string | null>(null);
    const [busyRequest, setBusyRequest] = React.useState<string | null>(null);

    const me = group?.participants.find((p) => p.user?._id === user?._id) ?? null;
    const isAdmin = !!group?.admins?.some((a) => a._id === user?._id);
    const deadlinePassed = votingDeadlinePassed(group);

    /* Whether the dinner itself is over, which the card had no concept of — it
       branched on `status` alone, and status does not know what day it is. A
       group nobody reopened sits at "open" or "voting" forever, so a dinner
       from last month rendered "Begin the voting" and "Waiting on the
       organiser", while a settled one offered to book a table for a night that
       has already been and gone. Everything below that is an ACTION is gated on
       this; the record — members, shortlist, winner, receipt — is not. */
    const isPast = groupIsStale(group);

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

    async function send(kind: "start" | "vote" | "close" | "book" | "lock", path: string, body?: unknown) {
        setBusy(kind);
        setError(null);
        try {
            if (kind === "vote") await axios.put(path, body);
            else if (kind === "lock") await axios.patch(path, body);
            else await axios.post(path, body);
            await refreshGroup();
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
            await refreshGroup();
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

    /* `group.membershipOpen === false` IS the value to send: locked means the
       next state is open, and anything else means the next state is locked.
       That also handles legacy groups where the field is absent — undefined is
       not false, so they read as open and the first tap locks them, which is
       what an admin looking at an unlocked switch expects. */
    async function toggleLock() {
        if (!group) return;
        await send("lock", `/api/user/matching/${group._id}`, {
            membershipOpen: group.membershipOpen === false,
        });
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

    if (!user || loading) {
        return (
            <div className={styles.page}>
                <Nav user={user ?? undefined} />
                <div className={styles.centered}>Loading…</div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <Nav user={user} />

            <div className={styles.layout}>
                {/* Back to the LIST, not the dashboard: that is where this page
                    is now reached from, and it is the only place showing the
                    user's other groups. */}
                <Link href="/matching/group" className={styles.back}>
                    <i className="ph-bold ph-arrow-left" />
                    All groups
                </Link>
                <h1 className={styles.title}>{group?.name ?? "Group"}</h1>
                <p className={styles.subtitle}>
                    {"Who's coming, who's voted, and where it's headed."}
                </p>

                {group ? (
                    <GroupCard
                        group={group}
                        meVoted={!!me?.hasVoted}
                        isAdmin={isAdmin}
                        isPast={isPast}
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
                        onToggleLock={toggleLock}
                    />
                ) : (
                    /* Not "you have no group" any more — this route names one.
                       Reaching here means the server said 404, which it does
                       both for an id that does not exist and for a group the
                       viewer is not in, on purpose. So the copy has to cover
                       both without claiming to know which. */
                    <div className={styles.empty}>
                        <div className={styles.emptyIcon}>
                            <i className="ph ph-users-three" />
                        </div>
                        <p className={styles.emptyTitle}>
                            {notFound ? "This group isn't available" : "Couldn't load this group"}
                        </p>
                        <p className={styles.emptyBody}>
                            {notFound
                                ? "It may have been deleted, or you're not a member of it."
                                : "Something went wrong fetching it. Try again in a moment."}
                        </p>
                        <Link href="/matching/group" className={styles.primaryBtn}>
                            Back to your groups
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
    isPast,
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
    onToggleLock,
}: {
    group: matching;
    meVoted: boolean;
    isAdmin: boolean;
    isPast: boolean;
    rows: { restaurant: Restaurant; votes: number }[];
    maxVotes: number;
    remaining: string;
    deadlinePassed: boolean;
    busy: null | "start" | "vote" | "close" | "book" | "lock";
    busyRequest: string | null;
    userId: string;
    onStart: () => void;
    onOpenVote: () => void;
    onClose: () => void;
    onAnswerRequest: (targetId: string, action: "approve" | "deny") => void;
    onBook: () => void;
    onToggleLock: () => void;
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
            {/* The name moved to the page's h1 once this became a per-group
                route — the title IS the group now. Repeating it two lines
                below was the same word twice for no extra information. */}
            <div className={styles.cardHead}>
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

            {/* Both blocks below are admin-only, and both routes answer 403 for
                anyone else — hiding them is so nobody is offered an action that
                will fail, not a security boundary.

                The lock stays visible with an empty queue: locking is exactly
                what you do BEFORE the requests arrive. Hidden once closed, when
                there is no longer a dinner to join. */}
            {/* Says the thing the page was leaving the user to infer from an
                empty card. Placed above the roster so it frames everything
                under it as a record rather than as controls that are missing. */}
            {isPast ? (
                <p className={styles.pastBanner}>
                    <i className="ph ph-clock-counter-clockwise" />
                    This dinner has passed — showing how it went.
                </p>
            ) : null}

            {isAdmin && group.status !== "closed" && !isPast ? (
                <div className={styles.lockRow}>
                    <i
                        className={
                            group.membershipOpen === false
                                ? `ph-fill ph-lock ${styles.lockIconOn}`
                                : `ph ph-lock-open ${styles.lockIcon}`
                        }
                    />
                    <span className={styles.lockText}>
                        {group.membershipOpen === false
                            ? "Guest list locked — nobody new can ask to join."
                            : "Anyone with the link can ask to join."}
                    </span>
                    {/* aria-pressed, not a checkbox: this is a button whose label
                        changes, and a screen reader needs the on/off state. */}
                    <button
                        type="button"
                        className={`${styles.lockBtn} ${
                            group.membershipOpen === false ? styles.lockBtnOn : ""
                        }`}
                        onClick={onToggleLock}
                        disabled={busy !== null}
                        aria-pressed={group.membershipOpen === false}
                    >
                        {busy === "lock"
                            ? "…"
                            : group.membershipOpen === false
                              ? "Unlock"
                              : "Lock"}
                    </button>
                </div>
            ) : null}

            {/* Strangers reach this queue by following a leaked invite link;
                friends of an admin are let straight in and never appear here.
                See lib/groupAdmission.ts. */}
            {isAdmin && pending.length > 0 && !isPast ? (
                <>
                    <div className={styles.sectionHead}>
                        <h2 className={styles.sectionTitle}>Requests</h2>
                        <span className={styles.rule} />
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

                                    <span className={styles.requestName}>
                                        {shortName(r.user)}
                                    </span>

                                    {/* `id &&` rather than a bare call: populate
                                        leaves user null for a deleted account,
                                        and answering with an undefined target
                                        would 400. */}
                                    <button
                                        className={styles.acceptBtn}
                                        disabled={waiting || !id}
                                        onClick={() => id && onAnswerRequest(id, "approve")}
                                    >
                                        {waiting ? "…" : "Accept"}
                                    </button>
                                    <button
                                        className={styles.declineBtn}
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
                    {/* Tense follows the calendar, not the status. "You're going
                        to Bella Italia" about last Tuesday is the single most
                        confusing thing this page could say. */}
                    {group.winner
                        ? isPast
                            ? `You went to ${group.winner.name}`
                            : `You're going to ${group.winner.name}`
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
                ) : isPast ? (
                    /* No booking a table for a night that has already been. The
                       reservation branch above still renders when one exists —
                       that is a receipt, and worth keeping. */
                    <p className={styles.note}>
                        <i className="ph ph-moon-stars" /> No table was booked for this one.
                    </p>
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

            {/* Every control below is something you do BEFORE the dinner, so
                the whole row goes once the night has passed — that empty
                <div> was the "no options" this page was showing. What replaces
                it depends on how the group ended: a closed one already said so
                in the winner row above, an unstarted one has said nothing yet
                and needs to. */}
            {isPast ? (
                group.status !== "closed" ? (
                    <p className={styles.note}>
                        <i className="ph ph-prohibit-inset" />
                        {group.status === "open"
                            ? "The vote never got started, so nothing was decided."
                            : "The night passed with the vote still open."}
                    </p>
                ) : null
            ) : (
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
            )}

            {group.status === "voting" && deadlinePassed && !isPast ? (
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
