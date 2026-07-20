"use client"
import React from "react"
import {createPortal} from "react-dom"
import styles from "./SearchModal.module.css";


export default function SearchModal({ onClose }: { onClose: () => void }){
    const [mounted,setMounted] = React.useState(false);
    const [query, setQuery] = React.useState("");
    
    const inputRef = React.useRef<HTMLInputElement>(null)
    React.useEffect(() => setMounted(true), []);
    React.useEffect(() => { inputRef.current?.focus(); }, [mounted])

    if(!mounted){
        return null;
    }
    return(
        createPortal(
        <div className={styles.backdrop} onClick={onClose}>
            <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={(e)=>e.preventDefault()}> 
                    <input
                        ref={inputRef}
                        className={styles.searchInput}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search restaurants…"
                    ></input>
            </form>
            </div>
        </div>,
        document.body
    ));

}