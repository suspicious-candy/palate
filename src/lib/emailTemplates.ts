/* Email HTML is a different medium from web HTML. There is no external
   stylesheet (Gmail strips <link>), no reliable flexbox or grid (Outlook renders
   through Word's engine), and no CSS variables. Everything below is inline
   styles on plain block elements, the subset every client agrees on.

   Templates live here rather than inside the routes that send them, so signup
   and the resend endpoint cannot drift into sending two different emails for the
   same thing. */

const BRAND = "#a41e22";

function shell(heading: string, body: string) {
    return `
<div style="margin:0;padding:24px;background:#f5f2f0;font-family:Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;">
    <div style="font-size:24px;font-weight:700;color:${BRAND};letter-spacing:-0.5px;">Palate</div>
    <h1 style="font-size:20px;font-weight:600;color:#1a1a1a;margin:24px 0 12px;">${heading}</h1>
    ${body}
  </div>
</div>`.trim();
}

/* Escapes user- and API-supplied text before it goes into an HTML string.
   Restaurant names and free-text notes both land in this email, and a name
   containing "<" would otherwise break the markup, or worse, inject into it. The
   iCalendar escaper in lib/calendar.ts is a different grammar for a different
   destination, and neither substitutes for the other. */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/* Rendered in the recipient's zone, taken from user.timeZone, which is captured
   from the browser at signup and refreshed on every login.

   Omitting the option entirely falls back to the server's zone, which is what
   accounts predating this field get until their next sign-in. timeZoneName stays
   on for exactly that case: a fallback rendering says which zone it means, so an
   offset time reads as offset rather than as wrong.

   The try/catch is not defensive padding. toLocaleString throws RangeError on an
   unrecognised zone, and this runs inside an after() callback where an exception
   is invisible, so the email would simply never arrive. Values written since
   lib/timezone.ts landed are validated, but rows written before it are not, and
   neither are hand-edited documents. */
function formatWhen(date: Date | string, timeZone?: string): string {
    const options: Intl.DateTimeFormatOptions = {
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
    };

    try {
        return new Date(date).toLocaleString("en-US", { ...options, timeZone });
    } catch {
        return new Date(date).toLocaleString("en-US", options);
    }
}

function detailRow(label: string, value: string) {
    return `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#8a8a8a;width:110px;">${label}</td>
      <td style="padding:6px 0;font-size:14px;color:#1a1a1a;">${value}</td>
    </tr>`;
}

export function reservationEmail(opts: {
    firstName: string;
    restaurantName: string;
    address?: string;
    date: Date | string;
    partySize: number;
    notes?: string;
    timeZone?: string;
    googleUrl: string;
}) {
    const rows = [
        detailRow("When", escapeHtml(formatWhen(opts.date, opts.timeZone))),
        detailRow("Where", escapeHtml(opts.restaurantName)),
        opts.address ? detailRow("Address", escapeHtml(opts.address)) : "",
        detailRow("Party", `${opts.partySize} ${opts.partySize === 1 ? "person" : "people"}`),
        opts.notes ? detailRow("Notes", escapeHtml(opts.notes)) : "",
    ].join("");

    const body = `
    <p style="font-size:15px;line-height:1.5;color:#444;margin:0 0 20px;">
      You're booked, ${escapeHtml(opts.firstName) || "there"}. Here are the details.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">${rows}</table>
    <a href="${opts.googleUrl}"
       style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;
              font-size:15px;font-weight:500;padding:14px 28px;border-radius:12px;">
      Add to Google Calendar
    </a>
    <p style="font-size:13px;line-height:1.5;color:#8a8a8a;margin:24px 0 0;">
      Not a Google user? The <strong>.ics</strong> file attached to this email
      works with Apple Calendar, Outlook and everything else — open it and the
      event is added.
    </p>`;

    return {
        subject: `Reservation confirmed — ${opts.restaurantName}`,
        html: shell("Your table is booked", body),
    };
}

export function reservationCancelledEmail(opts: {
    firstName: string;
    restaurantName: string;
    date: Date | string;
    timeZone?: string;
}) {
    const body = `
    <p style="font-size:15px;line-height:1.5;color:#444;margin:0 0 20px;">
      ${escapeHtml(opts.firstName) || "Hi"} — your table at
      <strong>${escapeHtml(opts.restaurantName)}</strong> on
      ${escapeHtml(formatWhen(opts.date, opts.timeZone))} has been cancelled.
    </p>
    <p style="font-size:13px;line-height:1.5;color:#8a8a8a;margin:0;">
      The calendar entry is withdrawn automatically — the attached file removes
      it from whichever calendar you added it to.
    </p>`;

    return {
        subject: `Reservation cancelled — ${opts.restaurantName}`,
        html: shell("Booking cancelled", body),
    };
}

export function verificationEmail(firstName: string, link: string) {
    /* The raw URL is repeated as text under the button on purpose. Corporate mail
       filters routinely rewrite or strip anchor hrefs, and when that happens the
       button is dead while the text URL still works. */
    const body = `
    <p style="font-size:15px;line-height:1.5;color:#444;margin:0 0 20px;">
      Hi ${firstName || "there"} — confirm this address and your Palate account is ready to go.
    </p>
    <a href="${link}"
       style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;
              font-size:15px;font-weight:500;padding:14px 28px;border-radius:12px;">
      Verify my email
    </a>
    <p style="font-size:13px;line-height:1.5;color:#8a8a8a;margin:24px 0 6px;">
      Button not working? Paste this into your browser:
    </p>
    <p style="font-size:12px;line-height:1.5;color:#8a8a8a;word-break:break-all;margin:0 0 20px;">
      ${link}
    </p>
    <p style="font-size:13px;color:#8a8a8a;margin:0;">
      This link expires in one hour. If you didn't sign up for Palate, ignore this email.
    </p>`;

    return {
        subject: "Verify your email — Palate",
        html: shell("Confirm your email address", body),
    };
}
