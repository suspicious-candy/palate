import { SAFE_USER_FIELDS } from "@/lib/userProjection";
import User from "@/models/userModel.js"
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { z } from "zod";
import Restaurant from "@/models/restaurantModel.js";
import { listNameSchema } from "@/lib/listName";

/* Same schema as /api/user/lists, from the same module. Both routes build a
   `lists.${name}` update path, so both are exposed to the same corruption — see
   lib/listName.ts. No MAX_LISTS check here: this route only ever writes into a
   name that already exists, and $addToSet on an unknown key would create a list
   that bypassed the cap, which is why the name is checked against the map
   below rather than trusted. */
export const argSchema = z.object({
    listName: listNameSchema,
    fsqId: z.string(),
    restName: z.string(),
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

        const rest = await Restaurant.findOne({ fsqId: result.data.fsqId });
        if (!rest) {
            return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
        }

        /* The list has to already exist. $addToSet on a missing Map key CREATES
           it, so without this the route is a second, uncapped way to make lists
           — MAX_LISTS is enforced in /api/user/lists and would simply be walked
           around. Filtering on the key also means a typo answers 404 instead of
           silently starting an empty list the user never asked for.

           `lists.${name}` in a FILTER is a read, not a write, so it cannot
           corrupt anything the way the update path can; the schema has already
           refused the characters that would matter either way. */
        const updateUser = await User.findOneAndUpdate(
            { _id: userId, [`lists.${result.data.listName}`]: { $exists: true } },
            { $addToSet: { [`lists.${result.data.listName}`]: rest._id } },
            { new: true, runValidators: true }
        ).select(SAFE_USER_FIELDS);

        if (!updateUser && (await User.exists({ _id: userId }))) {
            return NextResponse.json({ error: "List not found" }, { status: 404 });
        }

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

        const rest = await Restaurant.findOne({ fsqId: result.data.fsqId });
        if (!rest) {
            return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
        }

        const updateUser = await User.findByIdAndUpdate(
            userId,
            { $pull: { [`lists.${result.data.listName}`]: rest._id } },
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