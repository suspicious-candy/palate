import {connect} from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js"
import { NextRequest, NextResponse, after } from "next/server";
import { sendMail } from "@/lib/mailer";
import { verificationEmail } from "@/lib/emailTemplates";
import bcrypt from "bcryptjs";
import  jwt  from "jsonwebtoken";
import { z } from "zod";
import crypto from "crypto";
import { hit, clientKey, tooManyRequests, LIMITS } from "@/lib/rateLimit";

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

        /* Before connect() and before bcrypt.hash. Abuse here costs more than
           CPU: every accepted request also leaves a permanent row in the users
           collection, so the cost outlives the request that caused it. */
        const verdict = hit(`signup:${clientKey(request)}`, LIMITS.signup);
        if (!verdict.allowed) {
            return tooManyRequests(
                verdict.retryAfterSeconds,
                "Too many sign-up attempts. Try again later."
            );
        }

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

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const verificationToken = crypto.randomBytes(32).toString("hex");
        const newUser = new User({
            username,
            firstName,
            lastName,
            email,
            password: hashedPassword,
            phone,
            dob,
            verifyToken: verificationToken,
            verifyTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),

        });

        const savedUser = await newUser.save();

        /* Scheduled with after() so the response goes out before SMTP is dialled
           — signup returns in milliseconds instead of waiting on a mail server.

           The inner catch is not optional. By this line the user row is already
           committed, so letting a mail failure bubble to the outer catch would
           return a 500 for an account that DOES exist: the retry then hits
           "Email already in use" and the person is stuck holding an account they
           can neither verify nor recreate. A failed send is logged and left for
           the resend endpoint to recover. */
        after(async () => {
            try {
                const link = `${process.env.APP_URL}/verifyemail?token=${verificationToken}`;
                const { subject, html } = verificationEmail(savedUser.firstName, link);
                await sendMail(savedUser.email, subject, html);
            } catch (mailError) {
                console.error("[signup] verification email failed:", mailError);
            }
        });

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