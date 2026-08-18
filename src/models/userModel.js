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
        type: String,
        trim: true,
    },
    dob: {
        type: Date,
    },

    /* IANA zone name, captured from the browser at signup and refreshed on each
       login so it follows someone who moves. Used to render times in outgoing
       email as the recipient would read them — without it the server's own zone
       is the only guess available, which is correct on a laptop and wrong on a
       UTC host. Validated by lib/timezone.ts before it is ever written. */
    timeZone: {
        type: String,
        default: "",
    },

    reservations: [
        { type: mongoose.Schema.Types.ObjectId, ref: "reservations" },
    ],

    visitedResturants: [
        { type: mongoose.Schema.Types.ObjectId, ref: "restaurants" },
    ],

    savedAddresses: [{ type: mongoose.Schema.Types.ObjectId, ref: "address" }],

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

    matchingGroup:{
        type:{
            group:{ 
                type: mongoose.Schema.Types.ObjectId, ref: "matching" ,
                default:null
            },
            isInMatching:{
                type:Boolean,
                default:false,
            },
        }
    },

    wishlist:{
        type:[ { type: mongoose.Schema.Types.ObjectId, ref: "restaurants" }],
        default:[],
    },
    lists:{
        type: Map,
        of: [{ type: mongoose.Schema.Types.ObjectId, ref: "restaurants" }],
        default: {},
    },

    friendlist:{
        type:[{ type: mongoose.Schema.Types.ObjectId, ref: "users" }],
        default:[],
    },

    preferences:{
        type:{
            likedCuisines:[{
                fsqid:Number,
                name:String
            }],
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
