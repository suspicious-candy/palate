import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeNext } from "@/lib/safeNext";

const PROTECTED = ["/dashboard", "/profile", "/onBoarding", "/matching"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasToken = request.cookies.has("token");

  if (PROTECTED.some((p) => pathname.startsWith(p)) && !hasToken) {
    // Carry where they were headed so login can send them back there.
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  if ((pathname === "/login" || pathname === "/signup") && hasToken) {
    // An already-signed-in user following an invite link lands here; honour
    // their destination instead of dumping them on the dashboard.
    return NextResponse.redirect(
      new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};