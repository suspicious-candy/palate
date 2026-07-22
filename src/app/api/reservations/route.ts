import { connect } from "@/dbConfig/dbConfig";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import Restaurant from "@/models/restaurantModel.js";
import Reservation from "@/models/reservationModel.js";
import { z } from "zod";

const bodySchema = z.object({
  fsqId: z.string(),
  date: z.string(), // ISO-ish string from the form (datetime-local)
  partySize: z.number().int().min(1),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    await connect();

    // 1. auth — same pattern as the wishList route
    const token = request.cookies.get("token")?.value;
    const user = getUserFromToken(token);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 2. validate the body
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { fsqId, date, partySize, notes } = parsed.data;

    // 3. translate the client's fsqId into the restaurant's ObjectId
    const rest = await Restaurant.findOne({ fsqId });
    if (!rest) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    // 4. write the reservation (fills the model's required fields)
    const reservation = await Reservation.create({
      user: user.id,
      restaurant: rest._id,
      date: new Date(date),
      partySize,
      status: "confirmed", // the user self-reported a real booking
      notes,
    });

    return NextResponse.json({ success: true, reservation }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
