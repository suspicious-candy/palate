import Reservation from "@/models/reservationModel.js";
import User from "@/models/userModel.js";
import { connect } from "@/dbConfig/dbConfig";
import { markVisited } from "@/lib/visited";

/**
 * Bring one user's past bookings up to date: record the visit, append to their
 * history, and retire the row.
 *
 * Lifted out of GET /api/reservations because three callers now need the same
 * definition of "the meal happened" — that route, POST /api/reviews, and the
 * pending-review query. A route that only works because a *different* route ran
 * first is a dependency nothing declares.
 *
 * TWO SEPARATE CONCERNS, deliberately. The per-user writes (visit + history)
 * are personal and must happen once per participant; the status flip is shared
 * and must happen once per reservation. The original single query conflated
 * them: it selected `status: "confirmed"`, so on a group dinner the first
 * member to open the app flipped the row for everyone and the remaining four
 * matched nothing on their next call — they never got the visit or the history
 * entry, permanently and with no error.
 *
 * ORDER IS LOad-BEARING, as it was before. `reservationHistory` is the
 * checkpoint: it is what `$nin` below reads to decide there is nothing left to
 * do. So markVisited() must land BEFORE the history push — the reverse leaves a
 * reservation marked done with no visit recorded, and nothing ever retries it.
 * The status flip goes last for the same reason it did originally: it is the
 * write that makes the work stop repeating.
 */
export async function completeDueReservations(userId: string): Promise<void> {
    await connect();
    const now = new Date();

    /* The bound on the query below. Without it every dashboard load would
       re-push a user's entire past into $addToSet — free in effect, not in
       bytes on the wire. */
    const authUser = await User.findById(userId)
        .select("reservationHistory")
        .lean<{ reservationHistory?: unknown[] } | null>();
    const alreadyRecorded = authUser?.reservationHistory ?? [];

    /* NOT gated on status: "confirmed". A group row somebody else already
       flipped is still a meal THIS user ate. Cancelled is the only status that
       means it never happened. */
    const past = await Reservation.find({
        users: userId,
        status: { $ne: "cancelled" },
        date: { $lt: now },
        _id: { $nin: alreadyRecorded },
    }).select("_id restaurant");

    if (past.length) {
        await markVisited(userId, past.map((r) => r.restaurant));

        await User.findByIdAndUpdate(userId, {
            $addToSet: {
                reservationHistory: { $each: past.map((r) => r._id) },
            },
        });
    }

    /* Shared, so it runs off the reservation's own state rather than off
       `past` — a row every participant has already recorded is absent from
       `past` for all of them, yet may still be sitting at "confirmed" if the
       flip failed on an earlier pass. `status: "confirmed"` in the filter keeps
       it from resurrecting a cancelled booking. */
    await Reservation.updateMany(
        { users: userId, status: "confirmed", date: { $lt: now } },
        { $set: { status: "completed" } }
    );
}
