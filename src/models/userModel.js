import mongoose from "mongoose";

const userSchema = new mongoose.Schema({

    username: {
        type: String,
        required: [true, "Please provide a User Name"],
        unique: true,
        trim: true,
    },
    email: {
        type: String,
        required: [true, "Please provide a valid EmailID"],
        unique: true,
        trim: true,
    },
    password:{
        type:String,
        required:true,
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
    phone: {
        // String (not Number) so it can hold "+", spaces, parentheses, and any
        // leading zeros in international/formatted numbers.
        type: String,
        trim: true,
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
    isVerified:{
        type:Boolean,
        default:false,
    },
    Role:{
        type:String,
        enum:['user','admin'],
        default:'user',
    },
    forgotPasswordToken:String,
    forgotPasswordTokenExpiry:Date,
    verifyToken:String,
    verifyTokenExpiry:Date,

    isInMatching:{
        type:Boolean,
        default:false,
    },
    wishlist:{
        type:[ { type: mongoose.Schema.Types.ObjectId, ref: "restaurants" }],
        default:[],
    },
    lists:{
        type:[[{ type: mongoose.Schema.Types.ObjectId, ref: "restaurants" }]]
    },

    preferences:{
        type:{
            likedCuisines:[{
                fsqid:Number,
                name:String
            }],
            disliked:[String],
            allergines:{
              type: [String],
              default:[]
            },
            diet:{
              type: [String],
              default:[]
            },
        }
    }
});

const User = mongoose.models.users || mongoose.model("users", userSchema);
export default User;
