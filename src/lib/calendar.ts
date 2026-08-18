/* iCalendar (RFC 5545) generation for reservation emails.

   Takes documents rather than ids, deliberately. POST /api/reservations already
   holds both the reservation it just created and the restaurant it looked up, so
   re-fetching them here would be two queries for data already in scope. It also
   keeps this file pure: no database, no async, testable by reading the string it
   returns. */

const MEAL_DURATION_MINUTES = 90;

type ReservationForIcs = {
    _id: unknown;
    date: Date | string;
    partySize: number;
    status: string;
    notes?: string;
};

type RestaurantForIcs = {
    name: string;
    location?: { formattedAddress?: string };
    geocodes?: { latitude?: number; longitude?: number };
};

/* YYYYMMDDTHHMMSSZ: no dashes, no colons, no milliseconds. Not ISO 8601's
   punctuated form, which parsers reject or silently misread.

   Always UTC. Writing local times would mean shipping a VTIMEZONE block defining
   that zone's rules, whereas the recipient's calendar converts a UTC instant to
   their own zone for free. */
function formatIcsDate(value: Date | string): string {
    return new Date(value)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
}

/* Comma and semicolon separate multiple values in iCalendar, so an unescaped
   address such as "1463 Sunset Blvd, Los Angeles" parses as three locations.

   Backslash is replaced first. Doing it later would re-escape the backslashes
   introduced by the comma and semicolon rules and double them all. */
function escapeText(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r?\n/g, "\\n");
}

/* Content lines are capped at 75 octets, and longer ones continue on the next
   line with a single leading space. Most clients tolerate over-long lines, but a
   strict one rejects the file, and DESCRIPTION carrying a user's notes is
   exactly where the limit gets crossed. Continuations carry 74 characters
   because the leading space counts. */
function fold(line: string): string {
    if (line.length <= 75) return line;

    const parts = [line.slice(0, 75)];
    let rest = line.slice(75);
    while (rest.length > 74) {
        parts.push(rest.slice(0, 74));
        rest = rest.slice(74);
    }
    if (rest) parts.push(rest);

    return parts.join("\r\n ");
}

/* The .ics and the Google link describe the same event, so the values they share
   are derived once here. Two copies of "Dinner at ${name}" would drift the first
   time anyone edited one of them. */
function eventFields(
    reservation: ReservationForIcs,
    restaurant: RestaurantForIcs
) {
    const start = new Date(reservation.date);

    return {
        start,
        end: new Date(start.getTime() + MEAL_DURATION_MINUTES * 60 * 1000),
        title: `Dinner at ${restaurant.name}`,
        /* The same preference as lib/mapsUrl.ts: an address resolves to the right
           branch of a chain, where bare coordinates land on an unnamed pin.
           formattedAddress is not required on the schema, hence the fallback. */
        where:
            restaurant.location?.formattedAddress ??
            (restaurant.geocodes?.latitude != null
                ? `${restaurant.geocodes.latitude},${restaurant.geocodes.longitude}`
                : ""),
        description: [
            `Table for ${reservation.partySize}`,
            reservation.notes ? `Notes: ${reservation.notes}` : null,
        ]
            .filter(Boolean)
            .join("\n"),
    };
}

export function buildReservationIcs(
    reservation: ReservationForIcs,
    restaurant: RestaurantForIcs
): string {
    const cancelled = reservation.status === "cancelled";
    const { start, end, title, where, description } = eventFields(
        reservation,
        restaurant
    );

    /* Stable UID, incrementing SEQUENCE. That pair is what makes a cancellation
       replace the original event instead of landing beside it: the calendar
       matches on UID and accepts the higher sequence as newer. */
    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Palate//Reservations//EN",
        cancelled ? "METHOD:CANCEL" : "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:${reservation._id}@palate.app`,
        `DTSTAMP:${formatIcsDate(new Date())}`,
        `DTSTART:${formatIcsDate(start)}`,
        `DTEND:${formatIcsDate(end)}`,
        `SUMMARY:${escapeText(title)}`,
        where ? `LOCATION:${escapeText(where)}` : null,
        `DESCRIPTION:${escapeText(description)}`,
        cancelled ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
        cancelled ? "SEQUENCE:1" : "SEQUENCE:0",
        "END:VEVENT",
        "END:VCALENDAR",
    ].filter((line): line is string => line !== null);

    /* CRLF, not \n. The spec requires it, and getting this wrong is the most
       common reason a hand-built .ics imports as empty with no error. */
    return lines.map(fold).join("\r\n") + "\r\n";
}

/* A one-tap alternative to the attachment, for the Google majority. The .ics is
   still what makes this work everywhere else, so both go in the email.

   Note what is absent here: escapeText. Backslash-escaping commas is iCalendar
   grammar and this is a URL. URLSearchParams does the only encoding a URL needs,
   and pre-escaping would put literal backslashes in the event title. */
export function googleCalendarUrl(
    reservation: ReservationForIcs,
    restaurant: RestaurantForIcs
): string {
    const { start, end, title, where, description } = eventFields(
        reservation,
        restaurant
    );

    const params = new URLSearchParams({
        action: "TEMPLATE",
        text: title,
        /* Both stamps in the same compact UTC form as the .ics, joined by a
           slash. That is Google's own quirk, not an iCalendar convention. */
        dates: `${formatIcsDate(start)}/${formatIcsDate(end)}`,
        details: description,
    });
    if (where) params.set("location", where);

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
