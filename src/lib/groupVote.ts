import type { matching, Restaurant } from "@/lib/userContext";

export const VOTE_LEAD_MINUTES = 90;

export type TallyRow = {
    restaurant: Restaurant;
    votes: number;
    pct: number;
};

function key(r: Restaurant): string {
    return r.fsqId;
}

/* The three time helpers below read `date` and nothing else, so they ask for
   exactly that rather than for a whole `matching`. The public join page holds a
   narrowly-projected group — deliberately, since it must not fetch anyone's
   ballots — and a `matching` parameter would have forced a cast that lies about
   what was actually loaded. `matching` still satisfies this structurally, so
   every existing caller is unaffected. */
type Dated = { date: string | Date };

export function votingClosesAt(group: Dated | null | undefined): Date | null {
    if (!group?.date) return null;
    return new Date(new Date(group.date).getTime() - VOTE_LEAD_MINUTES * 60_000);
}

export function votingDeadlinePassed(
    group: Dated | null | undefined,
    now: Date = new Date()
): boolean {
    const closesAt = votingClosesAt(group);
    return closesAt !== null && now.getTime() >= closesAt.getTime();
}

/** How long a group stays current after its booked time. Relevance is about
    whether the dinner is still ahead of you, not about the vote's status — a
    settled vote for tonight is the most useful thing on the dashboard, and an
    un-started vote for last Tuesday is noise. The grace window keeps the
    winner's directions reachable while you are actually at the table.

    Lives here rather than in activeGroup so that pure callers can reach it
    without dragging a Mongoose model in behind it. */
export const STALE_AFTER_HOURS = 6;

/**
 * Whether the dinner is far enough in the past that the group is no longer a
 * live thing anyone can act on.
 *
 * Distinct from `status`, and the distinction matters: nothing forces a group
 * to ever reach "closed". closeVote only runs when somebody happens to load the
 * page, so a group nobody opened sits at "voting" indefinitely — and a check
 * that trusts `status` alone would happily admit someone to last month's
 * dinner. This asks the calendar instead.
 */
export function groupIsStale(
    group: Dated | null | undefined,
    now: Date = new Date()
): boolean {
    if (!group?.date) return false;
    const staleAt =
        new Date(group.date).getTime() + STALE_AFTER_HOURS * 60 * 60 * 1000;
    return now.getTime() > staleAt;
}

export function votedCount(group: matching | null | undefined): number {
    if (!group) return 0;
    return group.participants.filter((p) => p.hasVoted).length;
}

export function totalCount(group: matching | null | undefined): number {
    return group?.participants.length ?? 0;
}

export function hasVoted(
    group: matching | null | undefined,
    userId: string | undefined
): boolean {
    if (!group || !userId) return false;
    return group.participants.some((p) => p.user?._id === userId && p.hasVoted);
}


export function tally(group: matching | null | undefined): TallyRow[] {
    if (!group) return [];

    const counts = new Map<string, number>();
    for (const participant of group.participants) {
        if (!participant.hasVoted) continue;
        for (const approval of participant.approvals ?? []) {
            const id = key(approval);
            counts.set(id, (counts.get(id) ?? 0) + 1);
        }
    }

    const rows = group.restaurants.map((restaurant) => ({
        restaurant,
        votes: counts.get(key(restaurant)) ?? 0,
        pct: 0,
    }));

    /* HOW TIES BREAK, and it is deliberate rather than arbitrary — but it holds
       only because of two facts worth writing down.

       Array.prototype.sort has been STABLE since ES2019, so rows with equal
       votes keep the order they already had. That order comes from
       `group.restaurants`, which the shortlist route writes in the order
       /recommend/group ranked them. So a tie resolves to whichever restaurant
       the group's aggregated taste scored higher — the same least-misery
       ordering that built the ballot.

       Re-sort `rows` before this line, or store restaurants[] in any order
       other than rank order, and this quietly becomes a coin flip. Nothing
       would fail; the group would just start being told a different answer. */
    rows.sort((a, b) => b.votes - a.votes);

    const max = rows[0]?.votes ?? 0;
    if (max > 0) {
        for (const row of rows) row.pct = Math.round((row.votes / max) * 100);
    }

    return rows;
}

export function leader(group: matching | null | undefined): TallyRow | null {
    const [top] = tally(group);
    return top && top.votes > 0 ? top : null;
}
