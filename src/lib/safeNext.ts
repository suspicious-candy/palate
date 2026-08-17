/* Post-auth redirect targets arrive in the URL, so they are attacker-controlled.
   Only same-origin relative paths are allowed. Without this you have an open
   redirect: a link to /signup?next=https://evil.com/login lets someone sign up
   on the real site and land on a lookalike that asks for the password again.

   No imports here on purpose. The Edge-runtime constraint that originally
   forced this is gone — Next 16 runs proxy on Node, and setting the `runtime`
   option in a proxy file now throws — but the rule is worth keeping for a
   better reason: this is a security primitive called from proxy.ts, both auth
   pages and JoinGroupButton, and a file with no dependencies is one you can
   read top to bottom and be certain about.

   Relatedly: the Node runtime means jwt.verify would now WORK in proxy.ts.
   Deliberately not done. It puts a crypto operation on every page navigation,
   and proxy still is not the authorization boundary — its matcher excludes
   /api entirely, so lib/withAuth.ts remains the only thing standing between a
   request and the data. */
export function safeNext(
    next: string | null | undefined,
    fallback = "/dashboard"
): string {
    if (!next) return fallback;

    // Must be a path, not an absolute URL ("https://…", "javascript:…").
    if (!next.startsWith("/")) return fallback;

    // "//evil.com" is protocol-relative — the browser reads it as another host.
    if (next.startsWith("//")) return fallback;

    // "/\evil.com" — several browsers normalise the backslash into "//".
    if (next.startsWith("/\\")) return fallback;

    return next;
}

/* Client-only: read `next` when a handler fires.

   Deliberately not useSearchParams() — that subscribes the component to the URL
   during render, which forces a statically prerendered page into a Suspense
   boundary or a build error. These pages only need the value at click time. */
export function readNextParam(): string | null {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("next");
}
