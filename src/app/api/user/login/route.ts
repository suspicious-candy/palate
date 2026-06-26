import {connect} from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js"
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import  jwt  from "jsonwebtoken";

export const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(8),
});

export async function POST(request: NextRequest) {

    try{

        await connect();

        const reqBody = await request.json();

        const result = loginSchema.safeParse(reqBody);
        if (!result.success) {
            return NextResponse.json(
                { error: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { identifier, password } = result.data;

        // If the identifier parses as an email, look the user up by email;
        // otherwise treat it as a username.
        const isEmail = z.string().email().safeParse(identifier).success;
        const query = isEmail ? { email: identifier } : { username: identifier };

        const user = await User.findOne(query);

        // Same message whether the user is missing or the password is wrong,
        // so we don't leak which usernames/emails exist.
        if(!user){
            return NextResponse.json(
                {error:"Invalid credentials"},{status:401}
            );
        }
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }

        if (!process.env.TOKEN_SECRET) {
            return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
        }

        const tokenData = {
            id:user._id,
            username:user.username,
            role:user.Role,
            email: user.email
        };

        const token = await jwt.sign(tokenData,process.env.TOKEN_SECRET, {expiresIn:"1d"} )

        const response = NextResponse.json({
            message: "Login successful",
            success: true,
            userId: user._id,
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