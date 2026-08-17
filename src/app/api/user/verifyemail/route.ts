import { connect } from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hit, clientKey, tooManyRequests, LIMITS } from "@/lib/rateLimit";

const bodySchema = z.object({ token: z.string().min(1) });

/* POST, not GET, and not a click-through on the page itself.

   Mail clients and corporate security scanners PRE-FETCH links to check them
   for malware. If loading the URL performed the verification, a scanner would
   silently consume the token before the user ever clicked, and the real click
   would land on "invalid link". A page that renders first and then POSTs is
   invisible to that. */
export async function POST(request: NextRequest) {
    try {
        const verdict = hit(`verifyemail:${clientKey(request)}`, LIMITS.verifyEmail);
        if (!verdict.allowed) {
            return tooManyRequests(
                verdict.retryAfterSeconds,
                "Too many attempts. Try again shortly."
            );
        }

        await connect();

        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Missing token" }, { status: 400 });
        }

        /* One atomic findOneAndUpdate rather than find → mutate → save.

           Both conditions live in the FILTER, so an expired token simply does
           not match and there is no window between checking the expiry and
           acting on it. Atomicity also settles the double-click: two concurrent
           requests carrying the same token cannot both match, because the first
           $unset removes the field the second is filtering on.

           The token is unset rather than kept, which is what makes the link
           single-use — otherwise the URL sitting in an inbox stays a live
           credential forever. */
        const user = await User.findOneAndUpdate(
            {
                verifyToken: parsed.data.token,
                verifyTokenExpiry: { $gt: new Date() },
            },
            {
                $set: { isVerified: true },
                $unset: { verifyToken: "", verifyTokenExpiry: "" },
            },
            { new: true }
        ).select("email username isVerified");

        /* Deliberately one message for both "never existed" and "already spent".
           They are indistinguishable after the $unset, and the page offers a
           sign-in link so someone who simply clicked twice is not stranded. */
        if (!user) {
            return NextResponse.json(
                { error: "This link is invalid, expired, or has already been used." },
                { status: 400 }
            );
        }

        return NextResponse.json({ success: true, email: user.email });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
