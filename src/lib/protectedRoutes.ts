/* One list, two consumers.

   proxy.ts decides where to send a browser that arrives with no cookie at all.
   lib/sessionExpiry.ts decides where to send one whose session died partway
   through a visit. Both ask the same question — may this page be seen signed
   out? — at two different moments.

   Two copies drift, and the drift is silent in both directions: a page the
   server protects that the client refuses to rescue, or a public page the client
   evicts people from. The same reasoning moved googleMapsUrl into lib/ once
   three copies started disagreeing.

   No imports here, on purpose. proxy.ts loads this on every matched request, and
   a file that is nothing but a constant and a predicate can be read top to
   bottom with certainty. */
export const PROTECTED = [
    "/dashboard",
    "/profile",
    "/onBoarding",
    "/matching",
    "/reservation",
    "/lists",
];

/* Prefix matching, so "/lists" covers "/lists/anything". The consequence is
   worth noting: a future public route whose path starts with a protected prefix
   inherits the gate without anyone choosing that. */
export function isProtectedPath(pathname: string): boolean {
    return PROTECTED.some((p) => pathname.startsWith(p));
}
