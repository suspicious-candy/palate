"use client";
import axios from "axios";
import { isProtectedPath } from "@/lib/protectedRoutes";

/* proxy.ts handles "no cookie". THIS handles "cookie present, session dead" —
   a tampered token, a rotated TOKEN_SECRET, clock skew. Without it the user
   lands on a page that renders with no data and offers no way out: UserProvider
   catches the 401, logs it, sets user to null, and stops.

   It lives at the transport layer rather than in the ~22 call sites because a
   dead session is not a fact about the request that discovered it. It is a
   change in global state that every later request will also hit, so handling it
   per-call means writing the same recovery everywhere and forgetting it on the
   next one. A 404 belongs in a local catch; this does not. */

/* Registered at module scope, not in an effect: React StrictMode double-invokes
   effects in development, so an effect would install the interceptor twice and
   fire two navigations. Imported for its side effect by UserProvider, which is
   already a client component mounted in the root layout — so it is in place
   before the first request goes out. */

/* Login answers 401 for a wrong password, so a status check alone would bounce
   anyone who fat-fingers their password to /login?next=/login and swallow the
   error toast. Two independent things stop that:

   1. That route returns { error: "Invalid credentials" } with NO `code`, and we
      key on the code — which is what the code field was added for.
   2. This list, which is redundant today and is the point: a wrong password IS
      an authentication failure, so someone could reasonably add the code to
      that route later and the change would look correct. */
const AUTH_ENDPOINTS = ["/api/user/login", "/api/user/signup"];

/* One navigation, however many requests fail at once. The dashboard fires
   /api/user/dashboard and /api/user/friends in parallel, so a dead session
   produces two 401s within milliseconds of each other. */
let rescuing = false;

function shouldRescue(error: unknown): boolean {
    if (typeof window === "undefined" || rescuing) return false;

    const err = error as {
        response?: { status?: number; data?: { code?: string } };
        config?: { url?: string };
    };

    if (err.response?.status !== 401) return false;
    if (err.response?.data?.code !== "UNAUTHENTICATED") return false;

    const url = err.config?.url ?? "";
    if (AUTH_ENDPOINTS.some((e) => url.startsWith(e))) return false;

    /* The public pages are the reason this check exists. UserProvider sits in
       the root layout, so /api/user/dashboard fires on /join/[code] and
       /add/[username] too — where a signed-out visitor getting a 401 is the
       expected case, not a failure. Redirecting there would break the exact
       flow those pages were built for.

       This also subsumes the "already on /login" guard: /login and /signup are
       not protected paths, so a 401 raised there never reaches a redirect. */
    return isProtectedPath(window.location.pathname);
}

axios.interceptors.response.use(
    (response) => response,
    (error) => {
        if (shouldRescue(error)) {
            rescuing = true;
            const here = window.location.pathname + window.location.search;

            /* CLEAR THE COOKIE FIRST, and clear it server-side.

               Navigating straight to /login loops forever. proxy.ts bounces
               /login back to `next` whenever a token cookie EXISTS — it never
               checks whether that token is valid — so a dead-but-present
               cookie ping-pongs: dashboard 401s, we leave for /login, proxy
               sends us back to the dashboard, which 401s again.

               (That branch is unsound on its own, independently of this file:
               presence-only is a SAFE optimistic check for the protect branch,
               where the worst case is reaching a page that then 401s, but it is
               unsafe for the bounce branch, where it denies the login form to
               precisely the people who need it.)

               document.cookie cannot fix this: the token is httpOnly in
               production, so the browser will not let script touch it. Logout
               is the only thing that can, and it is also just the honest
               action — the session is dead, so ending it is correct rather than
               a workaround.

               .finally, not .then: a failed logout must not strand the user on
               a dead page. Worst case they arrive at /login still holding the
               bad cookie and take one extra bounce through here. */
            axios
                .post("/api/user/logout")
                .catch(() => {})
                /* location.assign, not the router: we are outside React, and a
                   full document load also discards the stale in-memory user
                   rather than carrying it into the login page. */
                .finally(() => window.location.assign(`/login?next=${encodeURIComponent(here)}`));
        }

        /* Re-rejected on every path. Resolving here would hand every downstream
           .then an undefined response — and navigation is asynchronous, so the
           current tick still runs even when we are leaving. */
        return Promise.reject(error);
    }
);
