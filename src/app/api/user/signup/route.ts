import {connect} from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js"
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

export const signupSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
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
        const { username, email, password } = result.data;

        console.log(reqBody);

        const user =  await User.findOne({email});

        if(user){
            return NextResponse.json(
                {error:"User already exists"},{status:400}
            );
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            username,
            email,
            password:hashedPassword
        });

        const savedUser = await newUser.save();
        console.log(savedUser);

        return NextResponse.json(
            { message: "User created successfully", success: true, userId: savedUser._id },
            { status: 201 }
        );
    }

    catch(error:any){
        return NextResponse.json({error: error.message},
            {status:500}
        )
    }

}