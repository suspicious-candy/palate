import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/dbConfig/dbConfig";
import { getUserFromToken, type TokenPayload } from "@/lib/auth";

/* THIS is the authorization boundary, not proxy.ts. Proxy only checks that a
   cookie named "token" exists — it never verifies the signature — so it is a UX
   gate that decides where to send a browser, and its matcher excludes /api
   entirely. Identity is established here, on every request, or nowhere.

   Handing `user` in as a parameter is the point: there is no signature in which
   a handler holds a verified user without this having run, so a new route
   cannot be born unauthenticated by omission the way it could when each one
   repeated the check itself. */

/* Generic in the context because Next types it per route: each [groupId] route
   gets its own RouteContext<'/literal/path'>, and a shared wrapper cannot know
   which one. Routes with no dynamic segment leave C as unknown and ignore it. */
type AuthedHandler<C> = (
    request:NextRequest,
    user:TokenPayload,
    context:C
)=> Promise<Response> | Response;

/* Correlation id, minted HERE rather than in proxy.ts — which is where it would
   normally live, except that proxy's matcher excludes /api, so it never runs
   for any of these routes. The wrapper is the only thing every authenticated
   request already passes through.

   Echoed on the response so a user can quote it in a bug report, and attached
   to the error log below so "it failed around 4:12" becomes one grep instead of
   a guess. */
function requestId(): string {
  return crypto.randomUUID();
}

export function withAuth<C>(handler: AuthedHandler<C>) {
  return async (request: NextRequest, context: C): Promise<Response> => {
    const rid = requestId();

    /* 500 and not 401: a server with no signing secret is broken, whereas a
       401 tells a signed-in user to log in again — down a path that cannot
       succeed either, so the whole userbase loops and the logs blame auth
       instead of the deploy. */
    if (!process.env.TOKEN_SECRET) {
      return withId(
        NextResponse.json({ error: "Server misconfigured" }, { status: 500 }),
        rid
      );
    }

    await connect();

    const user = getUserFromToken(request.cookies.get("token")?.value);
    if (!user) {
      /* `code` is the machine-readable half. The client interceptor keys off it
         rather than the bare status, so a 401 from anything that is not our own
         session cannot be mistaken for the session expiring. */
      return withId(
        NextResponse.json(
          { error: "Not authenticated", code: "UNAUTHENTICATED" },
          { status: 401 }
        ),
        rid
      );
    }

    /* The handlers each have their own try/catch returning a 500, so this
       catches only what escapes those — but every route's catch reports
       `error.message` and nothing else, so an id here is what ties a user's
       report to a stack. Rethrown, never swallowed. */
    try {
      return withId(await handler(request, user, context), rid);
    } catch (error: any) {
      console.error(`[${rid}] ${request.method} ${request.nextUrl.pathname}`, error);
      throw error;
    }
  };
}

/* Set on the RESPONSE, which is what makes it visible to the browser. The
   request-header variant (NextResponse.next({ request: { headers } })) is the
   proxy-side spelling and does the opposite job — it passes a value inward to
   the app. Conflating the two is how internals end up public. */
function withId(response: Response, rid: string): Response {
  response.headers.set("x-request-id", rid);
  return response;
}