import mongoose from "mongoose";

const participantSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    hasVoted: {
      type: Boolean,
      default: false,
    },
    approvals: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "restaurants" }],
      default: [],
    },
    votedAt: Date,
    // Captured once when this participant opens the group, not tracked
    // continuously. Scoped to the dinner rather than stored on the user: this
    // is the only feature that needs it, and it expires with the group.
    // [lng, lat] — GeoJSON order, matching restaurants.geo.
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: undefined },
    },
    locationAt: Date,
  },
  { _id: false }
);

const matchingSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    participants: {
      type: [participantSchema],
      required: true,
    },
    admins:{
      type:[{ type: mongoose.Schema.Types.ObjectId, ref: "users" }],
      required:true,
    },
    restaurants: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "restaurants",
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["open", "voting", "closed"],
      default: "open",
    },
    /* Whether the roster can still change — orthogonal to `status`, which
       governs the vote. Added before anything reads it because Mongoose applies
       defaults at creation only: introduce this later and every group made in
       the meantime has no value, which reads as falsy, which means locked —
       the opposite of the default declared here. */
    membershipOpen: {
      type: Boolean,
      default: true,
    },
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "restaurants",
      default: null,
    },
  },
  { timestamps: true }
);

/* Membership is looked up by scanning for the user inside participants[] rather
   than from a pointer on the user document, so this is the hottest query in the
   feature. Compound and in this order: the equality match on participants.user
   narrows first, then `date` serves both the staleness filter and the sort, so
   Mongo never has to sort in memory. */
matchingSchema.index({ "participants.user": 1, date: 1 });

// Mongoose 9 no longer passes `next` to pre hooks: return to continue, throw to
// reject. The old `function (next) { ... next() }` form fails at runtime.
matchingSchema.pre("save", function () {
  const allowed = new Set(this.restaurants.map((r) => r.toString()));

  for (const participant of this.participants) {
    const seen = new Set();
    for (const restaurantId of participant.approvals) {
      const id = restaurantId.toString();

      if (!allowed.has(id)) {
        throw new Error(
          `Approval ${id} is not one of this match's restaurants`
        );
      }
      if (seen.has(id)) {
        throw new Error(`Duplicate approval ${id} for a participant`);
      }
      seen.add(id);
    }
  }
});

const matching =
  mongoose.models.matching ||
  mongoose.model("matching", matchingSchema);

export default matching;
