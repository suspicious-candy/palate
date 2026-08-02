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
    rankedVotes: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "restaurants" }],
      default: [],
    },
    votedAt: Date,
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
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "restaurants",
      default: null,
    },
  },
  { timestamps: true }
);

// Mongoose 9 no longer passes `next` to pre hooks: return to continue, throw to
// reject. The old `function (next) { ... next() }` form fails at runtime.
matchingSchema.pre("save", function () {
  const allowed = new Set(this.restaurants.map((r) => r.toString()));

  for (const participant of this.participants) {
    const seen = new Set();
    for (const restaurantId of participant.rankedVotes) {
      const id = restaurantId.toString();

      if (!allowed.has(id)) {
        throw new Error(
          `Ranked vote ${id} is not one of this match's restaurants`
        );
      }
      if (seen.has(id)) {
        throw new Error(`Duplicate ranked vote ${id} for a participant`);
      }
      seen.add(id);
    }
  }
});

const matching =
  mongoose.models.matching ||
  mongoose.model("matching", matchingSchema);

export default matching;
