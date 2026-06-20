import mongoose from "mongoose";

const addressSchema = new mongoose.Schema({

    label: {
        type:String,
        enum:['Home','Office'],
    },
    address: {
        type:{
            aptNumber:{
                type:String,
            },
            streetAddress:{
                type:String,
                required:[true,'provide a valid  street address']
            },
            city:{
                type:String,
                required:[true,'provide a valid city']
            },
            state:{
                type:String,
                required:[true,'provide a valid state']
            },
            country:{
                type:String,
                required:[true,'provide a valid city']
            },
            pincode:{
                type:Number,
            }
        },
        required:[true,'provide a valid  address'],

    },
});

const address =  mongoose.model("address",addressSchema);
export default address;

