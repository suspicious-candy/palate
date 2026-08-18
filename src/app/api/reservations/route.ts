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

const bodySchema = z.object({
  fsqId: z.string(),
  date: z.string(),
  partySize: z.number().int().min(1),
  notes: z.string().optional(),
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
      date: new Date(date),
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