"use client";
import React from "react";

/* Shared by the dashboard and the group page. Lived inside dashboard/page.tsx
   until the group page needed the same countdown — and two screens computing
   "how long is left" separately is how they end up disagreeing by a minute. */

/**
 * A bare duration — "2h 14m", not "2h 14m left".
 *
 * The caller supplies the phrasing, because the same number reads as "voting
 * closes in" on one card and "dinner in" on another. Empty for a deadline that
 * has already passed, so the caller can say what expiry means in its own
 * context; null means there is no deadline at all — no group, or a group with
 * no date — and rendering nothing is right, since substituting `new Date()`
 * would show "Time's up" to someone with nothing to be late for.
 */
export function timeLeft(date: Date | null, now: Date = new Date()): string {
    if (!date) return "";

    const diffMs = new Date(date).getTime() - now.getTime();
    if (diffMs <= 0) return "";

    const totalMinutes = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

/** timeLeft(), re-rendered once a minute. */
export function useTimeLeft(date: Date | null): string {
    const [now, setNow] = React.useState(() => new Date());

    /* votingClosesAt() builds a fresh Date every render, so the object identity
       always differs. Keying the effect on the timestamp — a primitive, compared
       by value — means the interval is only torn down when the deadline actually
       moves, rather than on every render. */
    const deadline = date?.getTime() ?? null;

    React.useEffect(() => {
        if (deadline === null) return;
        const id = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(id);
    }, [deadline]);

    return timeLeft(date, now);
}
