"use client";
import { useSyncExternalStore } from "react";

/* Reading a browser-only value without a cascading render.

   THE PROBLEM THESE REPLACE

   Several components needed a value that only exists in the browser — the URL's
   `next` parameter, `window.location.origin`, "have we hydrated yet". The server
   has no window, so reading one during render is a hydration mismatch, and the
   usual workaround is:

       const [value, setValue] = useState("");
       useEffect(() => setValue(readIt()), []);

   That is correct and it is what the codebase did, with comments explaining why.
   The cost is a render pass: the component renders empty, the effect fires,
   setState schedules a second render, and only then does the real value appear.
   React's own lint rule (react-hooks/set-state-in-effect) flags it, and with
   `reactCompiler: true` in next.config.ts the compiler is entitled to assume
   this pattern is absent.

   WHY useSyncExternalStore IS THE RIGHT TOOL

   Its third argument, getServerSnapshot, exists for precisely this: return one
   value on the server and during hydration, another once running in the
   browser, with no state and no effect in between. React reads getSnapshot
   during render, so the browser value is present on the first client render
   rather than the second.

   getSnapshot must return a value that is stable under Object.is across calls
   with unchanged inputs, or React loops. Every use here returns a string or a
   boolean, which compare by value, so that holds. Do NOT reach for these with
   an object or array snapshot without memoising it first. */

/* Nothing here ever changes after mount, so the store has no subscribers to
   notify. A shared no-op unsubscribe keeps the function identity stable —
   passing an inline arrow would hand useSyncExternalStore a new subscribe on
   every render and make it re-subscribe each time. */
const NEVER_CHANGES = () => () => {};

/**
 * Whether the component is running in the browser rather than being rendered
 * on the server or hydrated.
 *
 * Replaces the `const [mounted, setMounted] = useState(false)` +
 * `useEffect(() => setMounted(true), [])` pair. Same meaning, one fewer render.
 */
export function useHydrated(): boolean {
    return useSyncExternalStore(
        NEVER_CHANGES,
        () => true,
        () => false
    );
}

/**
 * A value read from the browser, with an explicit server-side fallback.
 *
 * @param read produces the value in the browser. Called during render, so it
 *   must be cheap, must not throw, and must return something comparable by
 *   Object.is — a string, number or boolean. It may close over props or state;
 *   React re-reads it on every render, so the result tracks them.
 * @param serverValue what to use on the server and during hydration. It must
 *   match what the server actually rendered or hydration will mismatch.
 */
export function useClientValue<T extends string | number | boolean>(
    read: () => T,
    serverValue: T
): T {
    return useSyncExternalStore(NEVER_CHANGES, read, () => serverValue);
}
