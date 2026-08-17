import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";

/* Read once at module load. Everything out of process.env is a string, so the
   port has to be coerced before nodemailer sees it. */
const port = Number(process.env.SMTP_PORT);

/* Port 465 speaks TLS from the first byte (`secure: true`); 587 and 2525 open
   in plaintext and upgrade via STARTTLS (`secure: false`). Getting this wrong
   does not error — the socket just hangs until it times out — so it is derived
   from the port rather than left to a separate env var that can drift. */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: port === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/* One transporter for the whole process: creating it per call would re-open a
   connection to the mail server every time. */
export async function sendMail(
  to: string,
  subject: string,
  html: string,
  attachments?: Mail.Attachment[]
) {
  if (!process.env.SMTP_HOST || !process.env.MAIL_FROM) {
    throw new Error("SMTP is not configured — check SMTP_* and MAIL_FROM in .env");
  }

  const info = await transporter.sendMail({
    from: `"Palate" <${process.env.MAIL_FROM}>`,
    to,
    subject,
    html,
    attachments,
  });

  /* Ethereal accepts mail and then discards it, handing back a URL where the
     rendered message can be read instead. Nothing to log against a real SMTP
     provider, where getTestMessageUrl returns false. */
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) {
    console.log(`[mailer] preview: ${preview}`);
  }

  return info;
}
