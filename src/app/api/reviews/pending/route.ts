import { connect } from "@/dbConfig/dbConfig";
import Reservation from "@/models/reservationModel.js";
import Review from "@/models/reviewModel.js";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { completeDueReservations } from "@/lib/completeReservations";



const MAX_PENDING = 5;

export async function GET(request: NextRequest) {
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

        await completeDueReservations(user.id);

        const since = Date.now() - 14 * 24 * 60 * 60 * 1000;
        const reservations = await Reservation.find({
            users:user.id,
            status:"completed",
            date: { $gte: since }
        }).sort({date:-1}).limit(50).lean().populate({ path: "restaurant", select: "name fsqId" });
        const reservationIds = reservations.map(r => r._id);
        const reviews = await Review.find({user:user.id,reservation:{$in:reservationIds}}).select("reservation").lean();

        const confirmedReviewed:Set<string>=new Set(reviews.map(r => r.reservation.toString()))

        const pending = reservations
            .filter(r=>!confirmedReviewed.has(r._id.toString()))
            .slice(0,MAX_PENDING)
            .map(r=>({ reservationId: r._id, date: r.date, restaurant: r.restaurant }));

        return NextResponse.json({ success: true, pending }, { status: 200 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
