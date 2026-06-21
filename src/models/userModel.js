import mongoose from "mongoose";

const userSchema = new mongoose.Schema({

    username: {
        type: String,
        required: [true, "Please provide a User Name"],
        unique: true,
        trim: true,
    },
    profilePic: {
        type: String,
        default: "",
    },
    firstName: {
        type: String,
        default: "",
    },
    lastName: {
        type: String,
        default: "",
    },
    StarmembershipStatus: {
        type: Boolean,
        default: false,
    },
    firstOrderDate: {
        type: Date,
    },
    numVisits: {
        type: Number,
        default: 0,
    },
    favDish: {
        type: String,
        default: "",
    },
    email: {
        type: String,
        required: [true, "Please provide a valid EmailID"],
        unique: true,
        trim: true,
    },
    phone: {
        type: Number,
    },
    dob: {
        type: Date,
    },

    // Active/upcoming reservations — references into the reservations collection.
    reservations: [
        { type: mongoose.Schema.Types.ObjectId, ref: "reservations" },
    ],

    // Restaurants the user has actually visited.
    visitedResturants: [
        { type: mongoose.Schema.Types.ObjectId, ref: "restaurants" },
    ],

    // Embedded address sub-documents.
    savedAddresses: [{ type: mongoose.Schema.Types.ObjectId, ref: "address" }],

    // Past reservations — references into the reservations collection.
    reservationHistory: [
        { type: mongoose.Schema.Types.ObjectId, ref: "reservations" },
    ],

});

const User = mongoose.models.users || mongoose.model("users", userSchema);
export default User;
