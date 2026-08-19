/* Next runs register() once per server process, before the first request.

   This is the only hook that fires reliably in both `next dev` and `next start`
   without being attached to a route, which is what makes it the right place for
   a startup check — putting it in a module that happens to be imported early
   means it runs whenever the bundler decides, or not at all on a route that
   does not import it. */
export async function register() {
    /* Node only. The check reads process.env, and the edge runtime gets a
       different, much smaller environment where most of these are absent by
       design — warning there would be noise. */
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const { checkEnvironment } = await import("@/lib/env");
        checkEnvironment();
    }
}
