import { SAFE_USER_FIELDS } from "@/lib/userProjection";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { z } from "zod";
import User from "@/models/userModel.js";

/* THE ALLOWLIST IS THE AUTHORIZATION BOUNDARY, not merely validation. Every
   field absent from here is a field a user cannot change about themselves —
   `Role`, `isVerified`, `StarmembershipStatus`, `numVisits`, `password`, the
   reset tokens, and every relationship array (those have their own routes).
   Zod strips unknown keys by default, so .strict() is not what makes this safe;
   it is what turns a client sending the wrong key into a loud 400 rather than a
   silent no-op.

   `username` and `email` are deliberately NOT here. Both are unique-indexed, so
   editing them means catching an 11000 and answering 409 — and an email change
   should reset isVerified and re-send a verification mail, which does not exist
   yet. Left out on purpose, not by oversight.

   NO .min(1) anywhere: absent means "unchanged", empty string means "clear it".
   The model defaults these to "" and the profile page already renders a
   Placeholder for blanks, so a user must be able to erase a value they set. */
const argSchema = z
    .object({
        firstName: z.string().trim().max(60),
        lastName: z.string().trim().max(60),
        favDish: z.string().trim().max(120),
        /* Stored as a string to keep +, spaces and leading zeros (see
           userModel.js). The character class ends in * rather than +, which is
           what lets "" through to clear it — a + here would silently make the
           field un-erasable. */
        phone: z
            .string()
            .trim()
            .max(32)
            .regex(/^[0-9+().\-\s]*$/, "Phone can only contain digits, spaces and + ( ) - ."),
        /* .url() rejects "", so the union is what keeps "remove my photo"
           possible. This value goes straight into an <img src>, hence the
           constraint at all.

           .url() ALONE IS NOT ENOUGH: it accepts any scheme, so
           "javascript:alert(1)", "data:text/html,..." and "file:///etc/passwd"
           are all valid URLs by its reckoning and all used to be stored. An
           <img src> will not execute a javascript: URL in a current browser, so
           this was not a live XSS — but the value is user-controlled, it is
           rendered into markup, and the set of places it might get reused
           (a CSS url(), an <a href>, a share card) is larger than the one place
           it is used today. Pin the scheme at the boundary rather than trusting
           every future consumer to re-check.

           https only, not http: a mixed-content image on an https page is
           blocked by the browser anyway, so allowing it would only produce
           avatars that silently fail to load. */
        profilePic: z
            .string()
            .trim()
            .max(2048)
            .url()
            .refine((value) => {
                /* Constructing URL again rather than string-matching the
                   prefix. "  javascript:..." with leading control characters,
                   "JaVaScRiPt:", and percent-encoded variants all defeat a
                   startsWith check; the parser normalises the protocol for us
                   and .url() has already guaranteed this parses. */
                try {
                    return new URL(value).protocol === "https:";
                } catch {
                    return false;
                }
            }, "Profile picture must be an https:// URL")
            .or(z.literal("")),
        /* coerce, not z.date(): request.json() yields a string because JSON has
           no date type, so z.date() would reject every request. Plain z.string()
           overcorrects — it accepts "banana" and stores an Invalid Date.
           Nullable so a birthday can be cleared; null becomes an $unset below.

           Both bounds are refinements rather than .max(new Date()) because a
           constant would freeze at module load — server-start time, not now. */
        dob: z.coerce
            .date()
            .refine((d) => d.getTime() <= Date.now(), "Date of birth can't be in the future")
            .refine((d) => d.getFullYear() >= 1900, "Date of birth looks wrong")
            .nullable(),
    })
    .partial()
    .strict();

export const PATCH = withAuth(async (request, user) => {
    try {
        /* request.json() THROWS on malformed input rather than resolving to
           something falsy, so a truthiness check afterwards can never fire —
           the try/catch is the only thing that turns bad JSON into a 400
           instead of a 500. */
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
        }

        const result = argSchema.safeParse(body);
        if (!result.success) {
            /* BOTH halves, unlike every other route here, which returns
               fieldErrors alone. A .strict() rejection is not attached to any
               field — "Unrecognized key: \"Role\"" lands in formErrors — so
               fieldErrors on its own answers a bare `{}` for the single most
               important refusal this route makes. */
            const flat = result.error.flatten();
            return NextResponse.json(
                { error: flat.fieldErrors, formErrors: flat.formErrors },
                { status: 400 }
            );
        }

        /* Built from the keys the caller ACTUALLY SENT, not from a fixed list of
           all six. .partial() emits only the keys present in the request, so
           iterating them is what makes "absent means unchanged" literally true.

           Spelling out all six and letting the unsent ones be `undefined`
           happens to work — Mongoose strips undefined out of an update — but
           that is the driver being defensive, not the code being right, and it
           does not survive the null case below. */
        const set: Record<string, unknown> = {};
        const unset: Record<string, ""> = {};

        for (const [field, value] of Object.entries(result.data)) {
            /* Clearing a DATE is not the same as clearing a string. "" cannot
               cast to a Date, so dob uses null to mean "erase this" — and null
               has to become an $unset, because $set-ting null stores a null
               where the field should simply not exist. */
            if (value === null) unset[field] = "";
            else set[field] = value;
        }

        /* An empty PATCH is a client bug, not a success. Answering 200 to it
           hides a broken form that is silently saving nothing. */
        if (!Object.keys(set).length && !Object.keys(unset).length) {
            return NextResponse.json(
                { error: "No editable fields were provided." },
                { status: 400 }
            );
        }

        const update: Record<string, unknown> = {};
        if (Object.keys(set).length) update.$set = set;
        if (Object.keys(unset).length) update.$unset = unset;

        /* findByIdAndUpdate takes an ID, not a filter. Passing an object here
           does not throw — Mongoose pulls `_id` out of it and SILENTLY DISCARDS
           every other key, so extra fields added as a safety net would do
           nothing while looking like they do. The id came from a verified JWT,
           which is already the proof of identity; a filter would add nothing.

           runValidators because Mongoose skips schema validators on updates by
           default — enum and required rules simply do not run unless asked.
           -password so the hash never leaves the server. */
        const updatedUser = await User.findByIdAndUpdate(user.id, update, {
            new: true,
            runValidators: true,
        }).select(SAFE_USER_FIELDS);

        /* null means no user matched — a deleted account still holding a live
           cookie. This is the check that belongs here; there is no "did the
           validators pass" flag to read, because a validation failure THROWS
           and lands in the catch below. */
        if (!updatedUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        return NextResponse.json({
            message: "Profile updated",
            success: true,
            user: updatedUser,
        });
    } catch (error: any) {
        /* A schema validator rejecting the value is the caller's fault, so it is
           a 400 — letting it fall through to the generic 500 below would report
           a bad request as a server fault. */
        if (error?.name === "ValidationError") {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
});
