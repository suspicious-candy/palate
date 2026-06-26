import {connect} from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js"
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { email, success, z } from "zod";

await connect();

export const loginUsernameSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8),
});


export const loginEmailSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: NextRequest) {
    
    try{

        const reqBody = await request.json();

        const usernameResult = loginUsernameSchema.safeParse(reqBody);
        const emailResult = loginEmailSchema.safeParse(reqBody);

        if (!usernameResult.success && !emailResult.success) {
                return NextResponse.json(
                    { error: EmailResult.error.flatten().fieldErrors },
                    { status: 400 }
                );
        }

        if (usernameResult.success) {
            const { username, password } = usernameResult.data;
        }
        else if (EmailResult.success) {
            const { email, password } = emailResult.data;
        }
        
        const query = emailResult.success
        ? { email: emailResult.data.email }
        : { username: usernameResult.data.username };

         const password = emailResult.success
            ? emailResult.data.password
            : usernameResult.data!.password;

        const user = await User.findOne(query);

        if(!user){
            return NextResponse.json(
                {error:"User not found"},{status:401}
            );
        }
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }

        return NextResponse.json({
            meassage: "Login successfully",
            success:true,
             user: { id: user._id, username: user.username, email: user.email },
        })

    }

    catch(error:any){
        return NextResponse.json({error: error.message},
            {status:500}
        )
    }

}