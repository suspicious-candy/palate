import { connect } from "@/dbConfig/dbConfig";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import Restaurant from "@/models/restaurantModel.js";
import Reservation from "@/models/reservationModel.js";
import User from "@/models/userModel.js";
import { z } from "zod";
import { completeDueReservations } from "@/lib/completeReservations";

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

export async function GET(request: NextRequest) {
  try {
    await connect();

    const token = request.cookies.get("token")?.value;
    const user = getUserFromToken(token);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    await completeDueReservations(user.id);

    const reservations = await Reservation.find({ users: user.id })
      .populate("restaurant")
      .sort({ date: -1 });

    return NextResponse.json({ success: true, reservations });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connect();

    const token = request.cookies.get("token")?.value;
    const user = getUserFromToken(token);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

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

    return NextResponse.json({ success: true, reservation }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {

    try{

        await connect();

        if (!process.env.TOKEN_SECRET) {
            return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
        }

        const token = request.cookies.get("token")?.value;
        const user = getUserFromToken(token);
        if (!user) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }
        const userId = user.id;

        const reqBody = await request.json();

        const result = patchSchema.safeParse(reqBody);
        if (!result.success) {
        return NextResponse.json(
            { error: result.error.flatten().fieldErrors },
            { status: 400 }
        );
        }

        const { reservationId, status } = result.data;

        const updated = await Reservation.findOneAndUpdate(
          { _id: reservationId, users: user.id },
          { $set: { status } },
          { new: true, runValidators: true }
        );

        if(!updated){
            return NextResponse.json(
                {error : "Reservation not found"},
                {status:404}
            )
        }
         return NextResponse.json({ success: true, reservation: updated });
    }

    catch(error:any){
        return NextResponse.json({error: error.message},
            {status:500}
        )
    }

}