"use client"

import React from "react"
import { ReservationPrompt } from "@/components/ReservationPrompt";

type clicked = {
    fsqId:string;
    name:string;
    at:number;
}

const TrackerContext = React.createContext<(r: { fsqId: string; name: string }) => void>(() => {});
export const useTrackClick = () => React.useContext(TrackerContext);
export function ReservationTracker({children}:{children:React.ReactNode}){

    const clicksRef = React.useRef<clicked[]>([])
    const firstHiddenRef = React.useRef<number|null>(null);
    const debounceRef     = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const [batch, setBatch] = React.useState<clicked[] | null>(null);

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
        setBatch(windowed);                                           
    }
    React.useEffect(() => {
        function onVisibility() {
            if (document.visibilityState === "hidden") {
            if (firstHiddenRef.current === null) firstHiddenRef.current = Date.now(); 
            if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
            } else {
            debounceRef.current = setTimeout(finalize, 4000);
            }
        }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility); // cleanup
    }, []);
    return (
        <TrackerContext.Provider value={recordClick}>
        {children}
        {batch && <ReservationPrompt batch={batch} onClose={() => setBatch(null)} />}
        </TrackerContext.Provider>
  );

}
