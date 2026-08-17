import mongoose from "mongoose";

const reservationSchema = new mongoose.Schema(
  {
    users: [
        { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    ],
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "restaurants", // must match the model name in restaurantModel.js
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true, // the booked date + time
    },
    partySize: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ["confirmed", "cancelled", "completed"],
      default: "confirmed",
    },
    notes: String,
  },
  { timestamps: true }
);

reservationSchema.index({ users: 1, date: -1 });

const Reservation =
  mongoose.models.reservations ||
  mongoose.model("reservations", reservationSchema);

export default Reservation;
