import {connect} from "@/dbConfig/dbConfig";
import User from "@/models/userModel.js"
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import  jwt  from "jsonwebtoken";
import { hit, peek, clientKey, tooManyRequests, LIMITS } from "@/lib/rateLimit";

export const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(8),
});

/* A real bcrypt hash of nothing anyone knows, compared against when the account
   does NOT exist. See the timing note in the handler — this exists solely to
   make both branches cost the same. Computed once at module load, because doing
   it per request would reintroduce a difference in the other direction. */
const DUMMY_HASH = bcrypt.hashSync("password-that-is-never-correct", 10);

export async function POST(request: NextRequest) {

    try{

        /* Checked BEFORE connect() and before bcrypt. The whole point is to
           reject without paying: bcryptjs is pure JavaScript running on Node's
           single main thread, so ~100ms of it per attempt is a lever an
           attacker can pull against every other request the server is serving,
           not just against this route. */
        const ipKey = clientKey(request);
        const ipVerdict = hit(`login:ip:${ipKey}`, LIMITS.loginByIp);
        if (!ipVerdict.allowed) {
            return tooManyRequests(
                ipVerdict.retryAfterSeconds,
                "Too many sign-in attempts. Try again shortly."
            );
        }

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

        /* Second key, checked but not yet spent. A per-IP limit alone does
           nothing against a botnet grinding ONE account from a thousand
           addresses, and a per-account limit alone does nothing against one
           machine working through many accounts. Different attacks, different
           keys, both needed.

           peek rather than hit: this budget is consumed only by FAILURES,
           below. Charging successful sign-ins would let a user with a busy day
           lock themselves out. */
        const accountKey = `login:account:${identifier.toLowerCase()}`;
        const accountVerdict = peek(accountKey, LIMITS.loginByAccount);
        if (!accountVerdict.allowed) {
            return tooManyRequests(
                accountVerdict.retryAfterSeconds,
                "Too many sign-in attempts for this account. Try again later."
            );
        }

        const user = await User.findOne(query);

        /* CONSTANT TIME, and this is why the early return you would naturally
           write here is absent.

           The identical error message below exists so the endpoint does not
           reveal which accounts are real. Returning early when `user` is null
           defeats that completely: the missing-account path answers in a few
           milliseconds and the wrong-password path answers ~100ms later, once
           bcrypt has run. That is a 20x difference — readable from a SINGLE
           request, no statistics required — and it enumerates the whole user
           table.

           So the no-user branch burns an equivalent compare against
           DUMMY_HASH and throws the answer away. Both paths now cost one
           bcrypt.

           Note that the tidy version of this function is the insecure one.
           Anyone refactoring for clarity will delete this and reintroduce the
           leak, which is the only reason this comment is as long as it is. */
        const hashToCheck = user ? user.password : DUMMY_HASH;
        const passwordMatches = await bcrypt.compare(password, hashToCheck);
        const valid = !!user && passwordMatches;

        if (!valid) {
            // Only failures spend the per-account budget.
            hit(accountKey, LIMITS.loginByAccount);
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