/* ONE list, two consumers.

   proxy.ts decides where to send a browser that arrives with no cookie at all;
   lib/sessionExpiry.ts decides where to send one whose session died partway
   through a visit. Same question — "may this page be seen signed out?" — asked
   at two different moments.

   Two copies drift, and the drift is silent in both directions: a page the
   server protects that the client refuses to rescue, or a public page the
   client evicts people from. Same reasoning that moved googleMapsUrl into lib/
   once three copies started disagreeing.

   No imports here on purpose. proxy.ts loads this on every matched request, and
   a file that is nothing but a constant and a predicate is one you can read top
   to bottom and be certain about. */
export const PROTECTED = [
    "/dashboard",
    "/profile",
    "/onBoarding",
    "/matching",
    "/reservation",
    "/lists",
];

/* Prefix matching, so "/lists" covers "/lists/anything". Note the consequence:
   a future public route whose path starts with a protected prefix inherits the
   gate without anyone choosing that. */
export function isProtectedPath(pathname: string): boolean {
    return PROTECTED.some((p) => pathname.startsWith(p));
}
