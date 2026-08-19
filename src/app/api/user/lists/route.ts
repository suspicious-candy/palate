import { SAFE_USER_FIELDS } from "@/lib/userProjection";
import User from "@/models/userModel.js"
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { z } from "zod";
import { listNameSchema, MAX_LISTS } from "@/lib/listName";

/* listNameSchema, not z.string(). The name is interpolated into a Mongo update
   path below, so an unconstrained string is a write primitive rather than a
   label — see lib/listName.ts for what the three rejected characters actually
   do to the document. */
export const argSchema = z.object({
    listName: listNameSchema,
});

export const PATCH = withAuth(async (request, user) => {

    try{

        const userId = user.id;

        const reqBody = await request.json();

        const result = argSchema.safeParse(reqBody);
        if (!result.success) {
            return NextResponse.json(
                { error: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }
        const existingUser = await User.findById(userId);
        if (!existingUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        /* `?? new Map()` because a document written before `lists` had a default
           has no value for it, and .has() on undefined throws — a 500 for a user
           whose only mistake was signing up early. Same class of legacy-document
           guard as pendingOf() in groupAdmission.ts. */
        const lists = existingUser.lists ?? new Map();

        if (lists.has(result.data.listName)) {
            return NextResponse.json({ error: "List already exists" }, { status: 409 });
        }

        /* Checked before the write rather than enforced in the filter, unlike
           ADDRESS_LIMIT. A Map has no positional path to test for existence the
           way `savedAddresses.19` does, so there is no single atomic
           check-and-append available here. The race is worth accepting: two
           simultaneous creations can overshoot by one, and the number exists to
           bound dashboard populate cost rather than to be exact. */
        if (lists.size >= MAX_LISTS) {
            return NextResponse.json(
                { error: `You can keep at most ${MAX_LISTS} lists.` },
                { status: 409 }
            );
        }

        const updateUser = await User.findByIdAndUpdate(
            userId,
            { $set: { [`lists.${result.data.listName}`]: [] } },
            { new: true, runValidators: true }
        ).select(SAFE_USER_FIELDS);

        if(!updateUser){
            return NextResponse.json(
                {error : "User not found"},
                {status:404}
            )
        }
         return NextResponse.json({ success: true, user: updateUser });
    }

    catch(error:any){
        return NextResponse.json({error: error.message},
            {status:500}
        )
    }

});

export const DELETE = withAuth(async (request, user) => {
     try{

        const userId = user.id;

        const reqBody = await request.json();

        const result = argSchema.safeParse(reqBody);
        if (!result.success) {
        return NextResponse.json(
            { error: result.error.flatten().fieldErrors },
            { status: 400 }
        );
        }

        const updateUser = await User.findByIdAndUpdate(
            userId,
            { $unset: { [`lists.${result.data.listName}`]: "" } },
            { new: true, runValidators: true }
        ).select(SAFE_USER_FIELDS);

        if(!updateUser){
            return NextResponse.json(
                {error : "User not found"},
                {status:404}
            )
        }
         return NextResponse.json({ success: true, user: updateUser });
    }

    catch(error:any){
        return NextResponse.json({error: error.message},
            {status:500}
        )
    }
});