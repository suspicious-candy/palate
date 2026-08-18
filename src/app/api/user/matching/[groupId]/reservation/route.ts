import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import Reservation from "@/models/reservationModel.js";
import matchingModel from "@/models/matching.js";
import User from "@/models/userModel.js";
import { groupIsStale } from "@/lib/groupVote";
import { findGroupById } from "@/lib/activeGroup";

/* matching.js is untyped, so `group` comes back as `any` and every field access
   would typecheck no matter how it was spelled. Naming the shape locally is the
   only thing standing between a typo and a 500, the same reason
   shortlist/route.ts declares its own Participant. */
type Participant = { user: mongoose.Types.ObjectId };

export const POST = withAuth(async (
    request,
    user,
    context: RouteContext<'/api/user/matching/[groupId]/reservation'>) =>
{
    try{

        const { groupId } = await context.params;
        if (!mongoose.isValidObjectId(groupId)) {
            return NextResponse.json({ error: "Invalid group id" }, { status: 400 });
        }

        /* No request body. Everything this route needs — the restaurant, the
           time, the head count — is already in the database, and a body would
           only give the client something to lie about. The same reasoning applies
           in close/route.ts. */

        /* Raw rather than findGroupById. This handler only ever needs ids, and
           keeping the document raw means participants.user and winner stay
           ObjectIds rather than becoming populated objects halfway through. The
           populated copy is fetched once at the end, for the response. */
        const group = await matchingModel.findById(groupId).lean();
        if (!group) {
            return NextResponse.json({ error: "Group not found" }, { status: 404 });
        }

        const participants: Participant[] = group.participants;

        /* p.user is the ObjectId itself on a raw document, so .toString() applies
           to it directly, never .user._id.toString(). ObjectId has an `_id`
           getter that returns the ObjectId again in some versions and undefined
           in others, so the populated form of this line either compares garbage
           or throws. The populated spelling is correct in close/route.ts, which
           reads a populated group; this route does not. */
        const ingroup = participants.some((p) => p.user.toString() === user.id);
        if(!ingroup){
            /* 404 with the same wording as the missing-group case, because a
               distinct status or message would let anyone probe which group ids
               exist. */
            return NextResponse.json({ error: "Group not found" }, { status: 404 });
        }

        /* A raw document again, so admins[] holds bare ObjectIds. 403 rather than
           404, because the caller is in the group and there is nothing left to
           hide.

           Admin-only because booking commits everybody: it writes a reservation
           onto every participant's account. The same authority as starting and
           closing the vote. */
        const isAdmin = group.admins.some(
            (a: mongoose.Types.ObjectId) => a.toString() === user.id
        );
        if(!isAdmin){
            return NextResponse.json({ error: "Only a group admin can book the table" }, { status: 403 });
        }

        if (group.status !== "closed") {
            return NextResponse.json(
                { error: "The vote hasn't finished — there's no winner to book yet." },
                { status: 409 }
            );
        }

        /* A real state rather than a defensive check. closeVote deliberately
           stores null when nobody voted, because the honest record of a vote that
           produced nothing is nothing. */
        if(!group.winner){
            return NextResponse.json(
                { error: "The vote closed without a winner — there's nothing to book." },
                { status: 409 }
            );
        }

        if(groupIsStale(group)){
            return NextResponse.json(
                { error: "This dinner has already happened." },
                { status: 409 }
            );
        }

        if(group.reservation != null){
            /* != null rather than !== null. A group created before this field
               existed has no value at all, and === would read undefined as
               "unbooked" here while the $set filter below treats it as bookable.
               Both spellings have to agree, or the two disagree about the same
               group. */
            return NextResponse.json(
                { error: "This group's table is already booked.", reservationId: group.reservation },
                { status: 409 }
            );
        }

        const participantIds = participants.map((p) => p.user);

        /* Create first, then claim the group. The order is the whole design.
           These are two collections, so they cannot be one atomic write, which
           means one can fail after the other succeeded, and the choice is which
           wreckage to prefer.

           This way round, a failure leaves a reservation nobody points at:
           invisible, one wasted row, and the group can simply be booked again.
           The reverse — claim the slot with a pre-generated id, then create —
           leaves group.reservation pointing at a document that does not exist,
           the UI saying "booked", and the `reservation: null` filter below
           refusing every retry forever. Recoverable garbage beats unrecoverable
           inconsistency. */
        const reservation = await Reservation.create({
            users: participantIds,
            restaurant: group.winner,
            date: group.date,
            partySize: participantIds.length,
            status: "confirmed",
            /* Explains, on everyone's reservations page, why a booking they did
               not personally make is sitting there. */
            notes: `Group dinner · ${group.name}`,
        });

        /* Compare-and-set. `reservation: null` lives in the filter because two
           admins can reach this line together, and an early if-check would pass
           for both and book the table twice.

           `reservation: null` also matches documents where the field is absent,
           which is what lets groups created before the field existed be booked.
           This is the opposite of membershipOpen in join/route.ts, which needs
           `$ne: false` precisely because `true` does not match a missing field.
           Null is the one value Mongo treats that way. */
        const claimed = await matchingModel.updateOne(
            { _id: groupId, status: "closed", reservation: null },
            { $set: { reservation: reservation._id } }
        );

        if (claimed.matchedCount === 0) {
            /* Lost the race, so the row just created is deleted rather than left
               behind. This is the only moment anything knows it is an orphan. */
            await Reservation.deleteOne({ _id: reservation._id });

            const fresh = await matchingModel.findById(groupId).select("reservation").lean();
            return NextResponse.json(
                {
                    error: "Another admin booked the table first.",
                    reservationId: fresh?.reservation ?? null,
                },
                { status: 409 }
            );
        }

        /* After the claim, deliberately. The reservation already carries every
           participant in users[], so /api/reservations finds it for all of them
           either way, and this forward list is what the profile page reads. If
           this write fails the booking is still visible everywhere that matters,
           whereas doing it first would point users at a reservation the group
           does not know about.

           $addToSet rather than $push, so a retry is a no-op not a duplicate. */
        await User.updateMany(
            { _id: { $in: participantIds } },
            { $addToSet: { reservations: reservation._id } }
        );

        return NextResponse.json({
            message: "Table booked",
            success: true,
            group: await findGroupById(groupId),
            reservation,
        }, { status: 201 });
    }
    catch (error: any) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
});
