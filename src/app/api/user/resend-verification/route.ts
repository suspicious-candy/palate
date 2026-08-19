import { NextResponse, after } from "next/server";
import { withAuth } from "@/lib/withAuth";
import User from "@/models/userModel.js";
import crypto from "crypto";
import { sendMail } from "@/lib/mailer";
import { verificationEmail } from "@/lib/emailTemplates";
import { hit, tooManyRequests, LIMITS } from "@/lib/rateLimit";

/* The recovery path the signup route depends on. Signup deliberately swallows a
   mail failure rather than 500-ing on an account that already exists, which is
   only defensible because this exists to get the user unstuck afterwards.

   withAuth, obviously not withVerified — the entire audience for this endpoint
   is users who are not verified yet. Login is not gated either, so someone who
   lost their session can always get back in and reach this. */
export const POST = withAuth(async (request, user) => {
    try {
        /* Keyed on the account rather than the IP. The cost being rationed is an
           email sent to THIS person's inbox, and a shared office address should
           not spend everyone's budget. */
        const verdict = await hit(`resendverify:${user.id}`, LIMITS.resendVerification);
        if (!verdict.allowed) {
            return tooManyRequests(
                verdict.retryAfterSeconds,
                "Too many requests. Try again in a little while."
            );
        }

        const account = await User.findById(user.id).select(
            "email firstName isVerified"
        );

        if (!account) {
            return NextResponse.json({ error: "Account not found" }, { status: 404 });
        }

        /* Not an error. Someone clicking "resend" on a tab they left open after
           verifying in another one has done nothing wrong. */
        if (account.isVerified) {
            return NextResponse.json({
                success: true,
                alreadyVerified: true,
                message: "This address is already verified.",
            });
        }

        /* A fresh token rather than re-sending the old one, so the new mail
           carries a full hour and any earlier link stops working — two copies of
           a live credential in an inbox is one more than necessary. */
        const verificationToken = crypto.randomBytes(32).toString("hex");
        account.verifyToken = verificationToken;
        account.verifyTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
        await account.save();

        /* Same shape as signup: scheduled after the response, failure logged
           rather than thrown. The difference is that here a failure is visible —
           the user asked for this and will simply press the button again. */
        after(async () => {
            try {
                const link = `${process.env.APP_URL}/verifyemail?token=${verificationToken}`;
                const { subject, html } = verificationEmail(account.firstName, link);
                await sendMail(account.email, subject, html);
            } catch (mailError) {
                console.error("[resend-verification] send failed:", mailError);
            }
        });

        return NextResponse.json({
            success: true,
            message: "Verification email sent.",
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
});
