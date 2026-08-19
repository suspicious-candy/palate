import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/* REPORT-ONLY, and without a nonce. Both are deliberate.

   Report-only: the browser evaluates the policy and logs every violation to the
   console but blocks nothing. Shipping an untested CSP straight to enforcement
   is how you white-screen production, and no amount of reading predicts what a
   real app actually loads. Walk every screen, collect what this reports, fix
   the policy, THEN rename the header to Content-Security-Policy.

   No nonce: a nonce must be unique per request, which forces every page to be
   dynamically rendered — static optimization, ISR and PPR all stop applying.
   Nine of this app's routes are currently static. That trade may be worth it
   later; it is not something to take as a side effect of turning CSP on. The
   cost is 'unsafe-inline' on scripts, which is a real weakening: it is the
   difference between "an injected inline script is blocked" and "it runs".
   This policy is still worth having for everything else it constrains. */
const contentSecurityPolicy = [
    "default-src 'self'",
    /* Next injects its own inline bootstrap scripts on every page, so without a
       nonce they can only be allowed by 'unsafe-inline'. 'unsafe-eval' is
       development-only: React uses eval there to reconstruct server-side error
       stacks in the browser. It is never needed in production. */
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    /* CSS Modules are external files, but react-hot-toast writes inline style
       attributes on the Toaster, and those are governed here. */
    "style-src 'self' 'unsafe-inline'",
    /* THE ONE THAT WOULD BREAK THE APP AT 'self'. Foursquare category icons go
       through next/image and come back from this origin, so those are fine —
       but profile pictures are plain <img> tags pointing at arbitrary remote
       URLs (profile page, and FriendCard on the dashboard). 'self' alone blanks
       every avatar in the product. The tighter fix is to route avatars through
       next/image too; until then this stays permissive and honest about why. */
    "img-src 'self' data: blob: https:",
    // next/font self-hosts everything, so there is no font CDN to allow.
    "font-src 'self'",
    /* Verified: the browser never calls an external origin. The FastAPI
       recommender is reached server-side from the nearby route handler, so it
       is not a connect-src concern. ws: is the dev server's HMR socket. */
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Same intent as X-Frame-Options: DENY below, in the modern spelling.
    "frame-ancestors 'none'",
    /* Production only. On an http://localhost dev server this would try to
       upgrade the app's own requests to https and break the page. */
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  reactCompiler: true,
  /* WHY THE AVATARS ARE PLAIN <img> AND STAY THAT WAY.

     next/image only loads a remote host listed here, and `profilePic` is a URL
     the user types in — it can be any https origin. Supporting it through
     next/image therefore means `hostname: "**"`, and that turns the image
     optimiser into an OPEN PROXY: anyone can hand this deployment a URL and
     have the server fetch it and re-serve it, which is a bandwidth amplifier,
     an SSRF surface, and on a metered host a bill.

     So @next/next/no-img-element is disabled at those six call sites rather
     than obeyed, and each carries a pointer back here. The rule stays on
     everywhere else, which is what caught the genuinely fixable local asset in
     onBoarding. The QR code in InviteModal is the seventh: it is a data: URI
     the browser already has in memory, and there is nothing for an optimiser to
     do with it.

     The real fix, if avatars ever matter enough, is to stop storing foreign
     URLs — upload to storage this app controls and list that one hostname
     here. That also lets img-src in the CSP below tighten from `https:` to
     `self`, which is the same problem wearing a different hat. */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ss3.4sqi.net",
        pathname: "/img/categories_v2/**",
      },
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          /* HSTS. 300 was a testing value — five minutes of protection is
             effectively none, since the window an attacker needs is the FIRST
             request after the header lapses.

             A year is the conventional value and what preload lists require.
             It is also a commitment: once a browser has seen this, it refuses
             to talk to the origin over http at all, for a year, and there is no
             way to reach out and undo that. So it is set only in production —
             on an http://localhost dev server the header is ignored by browsers
             anyway, but a developer who later runs local https would otherwise
             lock their own machine out of the dev server.

             NOT `preload`, deliberately. Submitting to the preload list bakes
             the domain into browser binaries and removal takes months. That is
             a decision to make once the deployment has been stable on https for
             a while, not a side effect of a config tidy-up. `includeSubDomains`
             is left off for the same reason: it would cover subdomains that may
             not exist yet or may not be served over https. */
          {
            key: "Strict-Transport-Security",
            value: isDev ? "max-age=0" : "max-age=31536000",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=()",
          },
          /* Rename to "Content-Security-Policy" to enforce — only after the
             console is clean on every screen. */
          {
            key: "Content-Security-Policy-Report-Only",
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

export default nextConfig;