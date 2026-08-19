"use client"

import Link from "next/link";
import React from "react";
import {useRouter} from "next/navigation";
import axios from "axios"
import styles from "./login.module.css";
import { useUser } from "@/lib/userContext";
import { safeNext, readNextParam } from "@/lib/safeNext";
import { useClientValue } from "@/lib/useClientValue";
import { browserTimeZone } from "@/lib/timezone";
import { toast } from "react-hot-toast";

export default function LoginPage(){
    const { refreshUser } = useUser();
    const router = useRouter();
    const [user,setuser]= React.useState({
        identifier: "",
        password: "",
    });

    const buttonDisabled = !(
        user.identifier.length > 2 &&
        user.password.length > 7
    );

    const [loading,setloading]= React.useState(false);

    /* Read in the browser, not during server render: the server has no window,
       so reading inline would be a hydration mismatch. Sanitised here once, so
       an invalid `next` collapses to "" rather than silently becoming an
       explicit next=/dashboard downstream.

       useClientValue rather than useState + useEffect. Same hydration safety,
       but the value is present on the FIRST client render instead of the
       second — see lib/useClientValue.ts. */
    const nextParam = useClientValue(() => safeNext(readNextParam(), ""), "");

    const signupHref = nextParam
        ? `/signup?next=${encodeURIComponent(safeNext(nextParam))}`
        : "/signup";


    const onLogin = async ()=>{

        try{

            setloading(true);
            const res = await toast.promise(axios.post("/api/user/login", {
                ...user,
                timeZone: browserTimeZone(),
            }), {
                    loading: "Logging in to your account...",
                    success: "Login Successful!! Redirecting...",
                    error: (err) => err.response?.data?.error ?? "Login failed",
                });
                    if (res.data?.userId) {
                        localStorage.setItem("userId", res.data.userId);
                    }
                    await refreshUser();
                    router.push(safeNext(readNextParam()));
                } catch(error:any){
                    console.log("Login failed, " + error.message)
                }finally{
                    setloading(false);
                }

    }

        const  loaded=()=>{
            return(
                 <div className={styles.card}>
                <span className={styles.brand}>Palate</span>
                <h1 className={styles.title}>Log in to your account</h1>
                <p className={styles.subtitle}>Welcome back to Palate</p>


                <label htmlFor="identifier" className={styles.label}>Email or username</label>
                <input
                    id="identifier"
                    type="text"
                    placeholder="you@example.com or yourname"
                    className={styles.input}
                    value={user.identifier}
                    onChange={(e) => setuser({...user, identifier: e.target.value})}
                />

                <label htmlFor="password" className={styles.label}>Password</label>
                <input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className={styles.input}
                    value={user.password}
                    onChange={(e) => setuser({...user, password: e.target.value})}
                />

                <button
                    type="button"
                    className={styles.button}
                    onClick={onLogin}
                    disabled={buttonDisabled}
                >
                    {buttonDisabled ? "Enter your details" : "Log in"}
                </button>

                <p className={styles.footer}>
                    Not yet signed up?{" "}
                    <Link href={signupHref} className={styles.link}>Sign up</Link>
                </p>
            </div>
            );
    }

    const notloaded = ()=>{
        return (
            <div className={`${styles.card} ${styles.loadingCard}`}>
                <span className={styles.brand}>Palate</span>
                <div className={styles.spinner} />
                <p className={styles.loadingTitle}>Loading...</p>
            </div>
        );
    }
    

    return(
        <div className={styles.screen}>
            {loading ? notloaded() : loaded()}
        </div>
    )
}
