import {connect} from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js"
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import  jwt  from "jsonwebtoken";
import { z } from "zod";

export const signupSchema = z.object({
  username: z.string().min(3),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
  dob: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.date().optional()
  ),
});

export async function POST(request: NextRequest) {
    
    try{

        await connect();

        const reqBody = await request.json();

        const result = signupSchema.safeParse(reqBody);
        if (!result.success) {
        return NextResponse.json(
            { error: result.error.flatten().fieldErrors },
            { status: 400 }
        );
        }
        const { username, firstName, lastName, email, password, phone, dob } = result.data;

        if (!process.env.TOKEN_SECRET) {
            return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
        }

        const user = await User.findOne({ $or: [{ email }, { username }] });
        if (user) {
            return NextResponse.json(
                { error: user.email === email ? "Email already in use" : "Username already taken" },
                { status: 400 }
            );
        }

        if(user){
            return NextResponse.json(
                {error:"User already exists"},{status:400}
            );
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            username,
            firstName,
            lastName,
            email,
            password: hashedPassword,
            phone,
            dob,
        });

        const savedUser = await newUser.save();

        const tokenData = {
            id: savedUser._id,
            username: savedUser.username,
            role: savedUser.Role,
            email: savedUser.email,
        };
        const token = await jwt.sign(tokenData,process.env.TOKEN_SECRET, {expiresIn:"1d"} )

         const response = NextResponse.json({
            message: "Signup successful",
            success: true,
            userId: savedUser._id,
        })

        response.cookies.set("token",token,{
            httpOnly:true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24, // 1 day, matches the JWT expiry
        })
        
        return response;
    }

    catch(error:any){
        return NextResponse.json({error: error.message},
            {status:500}
        )
    }

}