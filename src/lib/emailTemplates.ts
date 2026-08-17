/* Email HTML is a different medium from web HTML. There is no external
   stylesheet (Gmail strips <link>), no reliable flexbox or grid (Outlook
   renders through Word's engine), and no CSS variables. Everything below is
   inline styles on plain block elements — the subset every client agrees on.

   Templates live here rather than inside the routes that send them so signup
   and the resend endpoint cannot drift into sending two different emails for
   the same thing. */

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

export function verificationEmail(firstName: string, link: string) {
    /* The raw URL is repeated as text under the button on purpose. Corporate
       mail filters routinely rewrite or strip anchor hrefs, and when that
       happens the button is dead while the text URL still works. */
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
