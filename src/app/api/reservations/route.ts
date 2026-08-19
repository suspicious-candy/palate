import mongoose from "mongoose";
import { NextResponse, after } from "next/server";
import { withAuth, withVerified } from "@/lib/withAuth";
import Restaurant from "@/models/restaurantModel.js";
import Reservation from "@/models/reservationModel.js";
import User from "@/models/userModel.js";
import { z } from "zod";
import { completeDueReservations } from "@/lib/completeReservations";
import { sendMail } from "@/lib/mailer";
import { reservationEmail, reservationCancelledEmail } from "@/lib/emailTemplates";
import { buildReservationIcs, googleCalendarUrl } from "@/lib/calendar";

/* How far ahead a table may be booked. Not a business rule so much as a
   sanity bound — a reservation in 2087 is a typo or a probe, and it would sit
   on the dashboard forever because nothing ever retires it. */
const MAX_BOOKING_AHEAD_DAYS = 365;

const bodySchema = z.object({
  fsqId: z.string(),

  /* z.coerce.date(), not z.string(). JSON has no date type so the value arrives
     as a string, and the old z.string() passed "banana" straight through to
     `new Date(date)` — an Invalid Date that Mongoose then rejected with a
     CastError, reported by the catch below as a 500 for what is plainly a bad
     request. coerce rejects it here, as a 400.

     THE LOWER BOUND IS NOT COSMETIC. Without it a booking could be dated in the
     past, and completeDueReservations — which runs on the next read — promptly
     flips anything past into "completed". A user could therefore manufacture a
     completed meal at a restaurant they have never visited and then review it,
     which writes into palateRating and into the learned-taste signal the group
     recommender reads. The validation gap and the review gate were separately
     reasonable; together they were a way to forge history.

     Refinements rather than .min(new Date()): a constant would be evaluated
     once at module load, freezing the boundary at server-start time. Same
     reasoning as the dob bounds in /api/user. */
  date: z.coerce
    .date()
    .refine((d) => d.getTime() > Date.now(), "A table can only be booked in the future")
    .refine(
      (d) => d.getTime() < Date.now() + MAX_BOOKING_AHEAD_DAYS * 24 * 60 * 60 * 1000,
      `A table can be booked at most ${MAX_BOOKING_AHEAD_DAYS} days ahead`
    ),

  /* An upper bound so the field cannot hold a number no restaurant could seat.
     999999 was accepted before this. */
  partySize: z.number().int().min(1).max(50),

  /* The model declares `notes: String` with no maxlength, so 5000 characters
     used to be stored verbatim and then rendered into the confirmation email
     and the .ics DESCRIPTION. 500 is well past what anyone writes about a
     dietary requirement. */
  notes: z.string().trim().max(500).optional(),
});
const patchSchema = z.object({
  reservationId: z.string(),
  status: z.enum(["confirmed", "cancelled", "completed"]),
});

export const GET = withAuth(async (request, user) => {
  try {
    await completeDueReservations(user.id);

    const reservations = await Reservation.find({ users: user.id })
      .populate("restaurant")
      .sort({ date: -1 });

    return NextResponse.json({ success: true, reservations });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

/* Verified-only: booking is the first action here that reaches a third party.
   GET and PATCH stay on withAuth — reading and cancelling your own reservations
   must keep working even while the address is unconfirmed. */
export const POST = withVerified(async (request, user) => {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { fsqId, date, partySize, notes } = parsed.data;

    const rest = await Restaurant.findOne({ fsqId });
    if (!rest) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const reservation = await Reservation.create({
      users: [user.id],
      restaurant: rest._id,
      // Already a Date — z.coerce.date() did the parsing, and re-wrapping it
      // would only clone.
      date,
      partySize,
      status: "confirmed",
      notes,
    });

    // The reservation carries a back-ref to the user; the user also keeps a
    // forward list. Both sides are written here so the profile page (which
    // reads user.reservations) stays in step with /api/reservations.
    await User.findByIdAndUpdate(user.id, {
      $addToSet: { reservations: reservation._id },
    });

    /* Same contract as signup: scheduled after the response so the booking UI
       never waits on SMTP, and swallowed on failure because the reservation is
       already committed — a mail outage must not turn a successful booking into
       a 500 the user retries into a duplicate.

       `rest` is reused rather than re-queried; it has been in scope since the
       lookup above. */
    after(async () => {
      try {
        /* The JWT carries username and email but no first name, and its email
           can be a day stale if the address changed. One extra read, paid after
           the response has already gone out. */
        const account = await User.findById(user.id).select("firstName email timeZone").lean();
        if (!account) return;

        const { subject, html } = reservationEmail({
          firstName: account.firstName,
          restaurantName: rest.name,
          address: rest.location?.formattedAddress,
          date: reservation.date,
          partySize: reservation.partySize,
          notes: reservation.notes,
          timeZone: account.timeZone || undefined,
          googleUrl: googleCalendarUrl(reservation, rest),
        });

        await sendMail(account.email, subject, html, [
          {
            filename: "reservation.ics",
            content: buildReservationIcs(reservation, rest),
            contentType: "text/calendar",
          },
        ]);
      } catch (mailError) {
        console.error("[reservations] confirmation email failed:", mailError);
      }
    });

    return NextResponse.json({ success: true, reservation }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

export const PATCH = withAuth(async (request, user) => {

    try{

        const reqBody = await request.json();

        const result = patchSchema.safeParse(reqBody);
        if (!result.success) {
        return NextResponse.json(
            { error: result.error.flatten().fieldErrors },
            { status: 400 }
        );
        }

        const { reservationId, status } = result.data;

        /* Zod only knows this is a string. A malformed one raises a CastError
           inside findOneAndUpdate, which the catch below reports as a 500 for a
           plainly bad request. Same guard, same reasoning, as POST /api/reviews. */
        if (!mongoose.isValidObjectId(reservationId)) {
            return NextResponse.json({ error: "Invalid reservation id" }, { status: 400 });
        }

        /* Populated so the cancellation email has a restaurant name and address
           to work with — findOneAndUpdate alone returns the bare ObjectId ref. */
        const updated = await Reservation.findOneAndUpdate(
          { _id: reservationId, users: user.id },
          { $set: { status } },
          { new: true, runValidators: true }
        ).populate("restaurant");

        if(!updated){
            return NextResponse.json(
                {error : "Reservation not found"},
                {status:404}
            )
        }

        /* Only on cancellation. "completed" is a bookkeeping transition run by
           completeDueReservations on a timer, and mailing someone about a dinner
           they already ate is noise. */
        if (status === "cancelled") {
            after(async () => {
                try {
                    const account = await User.findById(user.id)
                        .select("firstName email timeZone")
                        .lean();
                    if (!account) return;

                    const { subject, html } = reservationCancelledEmail({
                        firstName: account.firstName,
                        restaurantName: updated.restaurant.name,
                        date: updated.date,
                        timeZone: account.timeZone || undefined,
                    });

                    /* Same UID as the confirmation, SEQUENCE bumped, METHOD
                       CANCEL — that trio is what makes the recipient's calendar
                       withdraw the original entry instead of adding a second,
                       contradictory one beside it. buildReservationIcs derives
                       all three from status, which is already "cancelled" here. */
                    await sendMail(account.email, subject, html, [
                        {
                            filename: "reservation.ics",
                            content: buildReservationIcs(updated, updated.restaurant),
                            contentType: "text/calendar",
                        },
                    ]);
                } catch (mailError) {
                    console.error("[reservations] cancellation email failed:", mailError);
                }
            });
        }

         return NextResponse.json({ success: true, reservation: updated });
    }

    catch(error:any){
        return NextResponse.json({error: error.message},
            {status:500}
        )
    }

});