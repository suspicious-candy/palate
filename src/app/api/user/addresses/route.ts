import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { z } from "zod";
import User from "@/models/userModel.js";
import address from "@/models/addressModel.js";

/* Cap on one user's address book. savedAddresses is an unbounded array that
   /api/user/dashboard populates on every load, so growth here is paid for on
   every page view. The same reasoning drives PENDING_LIMIT in groupAdmission.ts:
   the number that matters is how many a human will actually keep. */
const ADDRESS_LIMIT = 20;

/* Zod is the only validation this data will ever see.

   addressModel.js reads as though it enforces four required fields with custom
   messages. It does not: `address` is declared as `{ type: {...}, required: … }`
   with a plain object literal, so Mongoose registers it as a single Embedded
   path and the inner rules never become live validators — `new address({})`
   validates clean. Until that model is rewritten with a real sub-Schema, every
   guarantee about this shape lives here.

   Hence .min(1) on the four required fields, which is the opposite call from
   PATCH /api/user, where .min(1) would have made those fields un-clearable.
   Mandatory-on-create and clearable-on-update want opposite rules. */
const addressShape = {
    streetAddress: z.string().trim().min(1).max(120),
    city: z.string().trim().min(1).max(80),
    state: z.string().trim().min(1).max(80),
    country: z.string().trim().min(1).max(80),
    aptNumber: z.string().trim().max(30).optional(),
    /* A number because the model says so. This silently destroys a leading zero,
       turning "02134" into 2134, which is the same reason `phone` is a String on
       the user model. Worth changing there before real addresses are seeded. */
    pincode: z.number().int().min(0).max(9_999_999).optional(),
    label: z.enum(["Home", "Office"]).optional(),
};

const postSchema = z.object(addressShape).strict();

/* .partial() so a PATCH can send one field, then .extend() so addressId stays
   required. Extending after partial is what keeps it mandatory while everything
   else became optional. */
const patchSchema = z
    .object(addressShape)
    .partial()
    .extend({ addressId: z.string().trim().min(1) })
    .strict();

function badRequest(error: z.ZodError) {
    /* Both halves are read: a .strict() rejection is not attached to any field,
       so fieldErrors alone answers a bare {} for an unrecognized key. */
    const flat = error.flatten();
    return NextResponse.json(
        { error: flat.fieldErrors, formErrors: flat.formErrors },
        { status: 400 }
    );
}

async function readJson(request: NextRequest) {
    try {
        return { ok: true as const, body: await request.json() };
    } catch {
        return { ok: false as const };
    }
}

/* ---------- POST: save a new address ---------- */

export const POST = withAuth(async (request, user) => {
    try {
        const parsedBody = await readJson(request);
        if (!parsedBody.ok) {
            return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
        }

        const result = postSchema.safeParse(parsedBody.body);
        if (!result.success) return badRequest(result.error);

        /* The request body is flat because that is a pleasant shape for an API,
           while addressModel nests everything under `address`. This is the
           mapping between the two.

           Rest-destructuring rather than naming the six fields by hand: spell
           them out and the next field added to addressShape is silently dropped
           here. Unknown keys do not throw in Mongoose, they vanish, and the
           document saves without them. */
        const { label, ...addressFields } = result.data;

        const created = await address.create({ label, address: addressFields });

        /* Create first, then attach. These are two collections, so this cannot be
           one atomic write, and the order decides which wreckage a failure
           leaves. This way round it is an address nobody points at: invisible,
           one row, and the user simply tries again. The reverse leaves
           savedAddresses holding an id that resolves to nothing, and the profile
           renders a blank card forever.

           The cap lives in the filter: `savedAddresses.19` existing means the
           array already holds 20, so this is one atomic check-and-append rather
           than a count followed by a racing push. */
        const attached = await User.updateOne(
            {
                _id: user.id,
                [`savedAddresses.${ADDRESS_LIMIT - 1}`]: { $exists: false },
            },
            { $push: { savedAddresses: created._id } }
        );

        if (attached.matchedCount === 0) {
            // The only moment anything knows this row is an orphan.
            await address.findByIdAndDelete(created._id);

            const stillThere = await User.exists({ _id: user.id });
            return stillThere
                ? NextResponse.json(
                      { error: `You can save at most ${ADDRESS_LIMIT} addresses.` },
                      { status: 409 }
                  )
                : NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        return NextResponse.json(
            { message: "Address saved", success: true, address: created },
            { status: 201 }
        );
    } catch (error: any) {
        if (error?.name === "ValidationError") {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
});

/* ---------- PATCH: edit an existing address ---------- */

export const PATCH = withAuth(async (request, user) => {
    try {
        const parsedBody = await readJson(request);
        if (!parsedBody.ok) {
            return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
        }

        const result = patchSchema.safeParse(parsedBody.body);
        if (!result.success) return badRequest(result.error);

        const { addressId, label, ...fields } = result.data;

        if (!mongoose.isValidObjectId(addressId)) {
            /* Cast before Mongo sees it. An unparseable id throws a CastError
               inside the query, which the catch below would report as a 500,
               whereas a bad id in the body is a bad request. */
            return NextResponse.json({ error: "Invalid address id" }, { status: 400 });
        }

        /* The ownership check. An address id arrives from the client, so whether
           it belongs to the caller has to be asked explicitly: looked up by _id
           alone, anyone holding any id could edit anyone's address.

           Matching the user on both _id and savedAddresses is the whole check,
           since Mongo matches a scalar against an array if any element equals it.

           404 rather than 403, with the same wording as a missing address, so
           this cannot be used to discover which address ids exist. */
        const owns = await User.exists({ _id: user.id, savedAddresses: addressId });
        if (!owns) {
            return NextResponse.json({ error: "Address not found" }, { status: 404 });
        }

        /* Dotted paths rather than a replacement object. `$set: { address: fields }`
           would overwrite the whole subdocument, so sending only `city` would
           erase the street, state and country. `address.city` touches one leaf
           and leaves its siblings alone.

           `label` is the exception: it lives at the top level rather than inside
           `address`, which is exactly why it is destructured out above. */
        const set: Record<string, unknown> = {};
        if (label !== undefined) set.label = label;
        for (const [field, value] of Object.entries(fields)) {
            set[`address.${field}`] = value;
        }

        /* An addressId with no fields is a client bug rather than a success. */
        if (!Object.keys(set).length) {
            return NextResponse.json(
                { error: "No address fields were provided." },
                { status: 400 }
            );
        }

        const updated = await address.findByIdAndUpdate(
            addressId,
            { $set: set },
            { new: true, runValidators: true }
        );

        /* Null means the ref survived but the document is gone: the dangling
           state the create ordering above exists to prevent, reachable only if
           something deleted the address between the ownership check and here. */
        if (!updated) {
            return NextResponse.json({ error: "Address not found" }, { status: 404 });
        }

        return NextResponse.json({
            message: "Address updated",
            success: true,
            address: updated,
        });
    } catch (error: any) {
        if (error?.name === "ValidationError") {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
});

/* ---------- DELETE: remove an address ---------- */

export const DELETE = withAuth(async (request, user) => {
    try {
        /* A query param rather than a body, matching friends/route.ts. A DELETE
           carrying one id needs nothing richer, and bodies on DELETE are awkward
           for plenty of HTTP clients. */
        const addressId = request.nextUrl.searchParams.get("addressId");
        if (!addressId || !mongoose.isValidObjectId(addressId)) {
            return NextResponse.json({ error: "Invalid address id" }, { status: 400 });
        }

        /* Ownership and the write in one operation: the filter asks whether the
           address is the caller's and the update detaches it, atomically. There
           is no window between checking and acting for anything to change.

           matchedCount rather than modifiedCount, although here they agree, since
           a filter that matched always has an element to pull. */
        const detached = await User.updateOne(
            { _id: user.id, savedAddresses: addressId },
            { $pull: { savedAddresses: addressId } }
        );

        if (detached.matchedCount === 0) {
            return NextResponse.json({ error: "Address not found" }, { status: 404 });
        }

        /* Pull first, delete second: the mirror of the create ordering, for the
           same reason. A failure here leaves an address document nobody
           references, which is invisible, and the user's list is already correct.
           Deleting first and then failing would leave a ref pointing at nothing,
           which is the state the profile cannot render. */
        await address.findByIdAndDelete(addressId);

        return NextResponse.json({
            message: "Address removed",
            success: true,
            addressId,
        });
    } catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
});
