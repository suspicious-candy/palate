import { redirect } from "next/navigation";

/* The dashboard IS the app's front door, so `/` sends you there rather than
   duplicating it. A redirect and not a second copy of the page: two files
   rendering the same screen drift, and only one of them gets the next fix.

   No auth check here. proxy.ts already protects /dashboard, so a signed-out
   visitor lands on /login carrying ?next=/dashboard and arrives at the right
   place after signing in — one rule about who may see the dashboard, in one
   file, rather than a second copy of it here that can disagree. */
export default function Home() {
    redirect("/dashboard");
}
