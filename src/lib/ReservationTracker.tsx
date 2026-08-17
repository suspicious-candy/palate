"use client"

import React from "react"
import { ReservationPrompt } from "@/components/ReservationPrompt";

type clicked = {
    fsqId:string;
    name:string;
    at:number;
}

type Item = { fsqId: string; name: string };

const TrackerContext = React.createContext<(r: Item) => void>(() => {});
export const useTrackClick = () => React.useContext(TrackerContext);

/* The prompt already lives here, mounted app-wide by the layout, so anything
   that wants to open it deliberately — a card's reserve button, "Book Again" —
   asks this rather than standing up a second copy of the modal per screen. */
const OpenReservationContext = React.createContext<
    (r: Item, opts?: { onSaved?: () => void }) => void
>(() => {});
export const useOpenReservation = () => React.useContext(OpenReservationContext);

export function ReservationTracker({children}:{children:React.ReactNode}){

    const clicksRef = React.useRef<clicked[]>([])
    const firstHiddenRef = React.useRef<number|null>(null);
    const debounceRef     = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    /* Kept in a ref, not state: the caller passes it at open time and only the
       close/save path reads it, so re-rendering on it would buy nothing. */
    const onSavedRef = React.useRef<(() => void) | null>(null);

    const [prompt, setPrompt] = React.useState<{ batch: Item[]; mode: "confirm" | "book" } | null>(null);

    const openReservation = React.useCallback(
        (r: Item, opts?: { onSaved?: () => void }) => {
            onSavedRef.current = opts?.onSaved ?? null;
            setPrompt({ batch: [{ fsqId: r.fsqId, name: r.name }], mode: "book" });
        },
        []
    );

    const closePrompt = React.useCallback(() => {
        onSavedRef.current = null;
        setPrompt(null);
    }, []);

    function recordClick(r:{fsqId:string,name:string}){

        clicksRef.current.push({...r, at:Date.now()});
        if(debounceRef.current){
            clearTimeout(debounceRef.current);
            debounceRef.current=null;
        }

    }
    function finalize() {
        const clicks = clicksRef.current;
        const firstHidden = firstHiddenRef.current;
        clicksRef.current = []; firstHiddenRef.current = null; debounceRef.current = null;

        if (!clicks.length || firstHidden === null) return;
        if ((Date.now() - firstHidden) / 1000 <= 20) return;        

        const lastAt = Math.max(...clicks.map(c => c.at));
        const windowed = clicks.filter(c => c.at >= lastAt - 30000);
        setPrompt({ batch: windowed, mode: "confirm" });
    }
    React.useEffect(() => {
        function onVisibility() {
            if (document.visibilityState === "hidden") {
            if (firstHiddenRef.current === null) firstHiddenRef.current = Date.now(); 
            if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
            } else {
            debounceRef.current = setTimeout(finalize, 2500);
            }
        }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
    }, []);
    return (
        <TrackerContext.Provider value={recordClick}>
        <OpenReservationContext.Provider value={openReservation}>
        {children}
        {prompt && (
            /* Keyed so a second open starts with fresh date/party fields —
               the prompt seeds its state from `batch` on mount only. */
            <ReservationPrompt
                key={`${prompt.mode}:${prompt.batch.map((b) => b.fsqId).join(",")}`}
                batch={prompt.batch}
                mode={prompt.mode}
                onClose={closePrompt}
                onSaved={() => onSavedRef.current?.()}
            />
        )}
        </OpenReservationContext.Provider>
        </TrackerContext.Provider>
  );

}
