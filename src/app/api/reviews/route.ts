import { connect } from "@/dbConfig/dbConfig";
import Reservation from "@/models/reservationModel.js";
import Review from "@/models/reviewModel.js";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { completeDueReservations } from "@/lib/completeReservations";
import mongoose from "mongoose";
import { z } from "zod";

/* No restaurantId. The client says WHICH MEAL; the restaurant is read off the
   reservation below. Accepting it here would reopen the hole the denormalised
   `restaurant` field creates — anyone could pair their own reservation with a
   restaurant they have never been to and have it counted as a real visit. */
const postSchema = z.object({
    reservationId: z.string(),
    rating: z.number().int().min(1).max(5),
    text: z.string().max(999).optional(),
});

export async function POST(request: NextRequest) {
    try {
        await connect();

        if (!process.env.TOKEN_SECRET) {
            return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
        }

        const token = request.cookies.get("token")?.value;
        const user = getUserFromToken(token);
        if (!user) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        /* No User.findById here. The token carries the id, nothing in this
           handler needs the user document, and a lookup that exists only to be
           checked for null is a round trip buying nothing. */

        /* Bring this user's past bookings up to date FIRST, so the status check
           below reads a current value. Without it a meal an hour in the past is
           still "confirmed" until something happens to load
           GET /api/reservations, and the review is refused for a meal that
           plainly already happened. */
        await completeDueReservations(user.id);

        /* .json() THROWS on a malformed or absent body rather than returning
           null, so it needs its own catch — otherwise a bad request lands in
           the outer handler and is reported as a 500. */
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
        }

        const result = postSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }
        const { reservationId, rating, text } = result.data;

        /* Zod only knows this is a string. Handing a malformed one to findOne
           raises a CastError, which the outer catch would report as a 500 for
           what is plainly a client mistake. */
        if (!mongoose.isValidObjectId(reservationId)) {
            return NextResponse.json({ error: "Invalid reservation id" }, { status: 400 });
        }

        /* Ownership lives in the FILTER, not in an if-statement afterwards.
           `users` is an array of ObjectIds, so Mongo's array-contains match is
           the correct comparison; the hand-written version (`users.includes(
           userId)`) compares ObjectId objects against a string with === and is
           false for everybody. Same spelling as the PATCH in
           reservations/route.ts.

           One message for "does not exist" and for "not yours": anything that
           distinguishes them lets a caller probe which reservation ids are
           real. */
        const reservation = await Reservation.findOne({
            _id: reservationId,
            users: user.id,
        });
        if (!reservation) {
            return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
        }

        /* 409, not 400: the request is well-formed, it just conflicts with the
           state of this booking. completeDueReservations above has already
           retired anything genuinely past, so this now only rejects future
           bookings and cancellations. */
        if (reservation.status !== "completed") {
            return NextResponse.json(
                { error: "You can only review a meal you've had" },
                { status: 409 }
            );
        }

        let review;
        try {
            review = await Review.create({
                user: user.id,
                /* From the document, never the body. */
                restaurant: reservation.restaurant,
                reservation: reservation._id,
                rating,
                text,
            });
        } catch (err: any) {
            /* A duplicate-key failure is a raw MongoServerError, NOT a Mongoose
               ValidationError — it is identified by code 11000 and nothing
               else. This is the unique {user, reservation} index doing the work
               a find-then-insert could not: two tabs both read "no review yet"
               and both insert, whereas here the second write loses.

               Caught tightly and rethrown so the outer handler keeps meaning
               "something unexpected happened". */
            if (err?.code === 11000) {
                return NextResponse.json(
                    { error: "You've already reviewed this meal" },
                    { status: 409 }
                );
            }
            throw err;
        }

        return NextResponse.json({ success: true, review }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
