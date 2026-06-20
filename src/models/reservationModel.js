import mongoose from "mongoose";

const reservationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users", // must match the model name in userModel.js
      required: true,
      index: true,
    },
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
      enum: ["pending", "confirmed", "cancelled", "completed"],
      default: "pending",
    },
    notes: String, // optional: "window seat", allergies, etc.
  },
  { timestamps: true }
);

const Reservation =
  mongoose.models.reservations ||
  mongoose.model("reservations", reservationSchema);

export default Reservation;
