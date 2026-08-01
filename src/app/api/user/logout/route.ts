import { NextResponse } from "next/server";

export async function POST() {
    const response = NextResponse.json({ message: "Logged out", success: true });

    // Login sets `token` with httpOnly, so browser JS can't touch it — clearing
    // it has to come from the server as a Set-Cookie. The attributes below must
    // match the ones login used (path especially), otherwise the browser treats
    // this as a *different* cookie and leaves the original in place.
    response.cookies.set("token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
    });

    return response;
}
