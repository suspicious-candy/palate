/* IANA timezone names such as "America/Los_Angeles" arrive from the browser via
   Intl.DateTimeFormat().resolvedOptions().timeZone, which makes them user input
   that cannot be trusted to name a real zone.

   That matters more than it looks. toLocaleString throws a RangeError on an
   unknown timeZone rather than falling back, so storing an unchecked value would
   turn a junk string in one user's document into an exception every time that
   user's reservation email is generated — inside an after() callback, where the
   only symptom is a log line and an email that never arrives.

   Validated on write, at signup and login, so bad values are never stored, and
   guarded again on read in emailTemplates, because rows written before this
   existed are not covered by the first check. */
export function isValidTimeZone(value: unknown): value is string {
    if (typeof value !== "string" || value.length === 0) return false;

    try {
        // Constructing the formatter is the check, because that is what throws.
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
    } catch {
        return false;
    }
}

/* The browser's own zone, for the signup and login forms to send.

   Called at submit time rather than during render. On the server this resolves
   to the host's zone, so putting it in initial state would both send the wrong
   value and produce a hydration mismatch. A click handler only ever runs in the
   browser, which sidesteps both. */
export function browserTimeZone(): string | undefined {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    } catch {
        return undefined;
    }
}

/* Narrows a candidate to a storable value. Returns undefined rather than
   throwing, because a browser reporting an unrecognised zone is not a reason to
   refuse a signup. It is a reason to fall back to the server's zone and label
   it, which is what formatWhen already does. */
export function normalizeTimeZone(value: unknown): string | undefined {
    return isValidTimeZone(value) ? value : undefined;
}
