"use client"

import Link from "next/link";
import React from "react";
import {useRouter} from "next/navigation";
import axios from "axios"
import styles from "./signup.module.css";
import { toast } from "react-hot-toast";
import { useUser } from "@/lib/userContext";
import { safeNext, readNextParam } from "@/lib/safeNext";
import { useClientValue } from "@/lib/useClientValue";
import { browserTimeZone } from "@/lib/timezone";


export default function SignupPage(){

    const { refreshUser } = useUser()
    const router = useRouter();
    const [user,setuser]= React.useState({
        email: "",
        lastName:"",
        phone:"",
        dob:"",
        password: "",
        ConfirmPassword: "",
        username: "",
        firstName: "",
    });

    const buttonDisabled = !(
        user.email.length > 0 &&
        user.password.length > 7 &&
        user.username.length > 2 &&
        user.firstName.length > 0 &&
        user.password === user.ConfirmPassword
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

    const loginHref = nextParam
        ? `/login?next=${encodeURIComponent(safeNext(nextParam))}`
        : "/login";

    const onSignup = async ()=>{

        try{

            setloading(true);
            const res = await toast.promise(axios.post("/api/user/signup", {
                ...user,
                timeZone: browserTimeZone(),
            }), {
                loading: "Creating your account...",
                success: "Account created! Redirecting...",
                error: (err) => err.response?.data?.error ?? "Signup failed",
            });

            if (res.data?.userId) {
                localStorage.setItem("userId", res.data.userId);
            }
            await refreshUser();

            // Onboarding sits between signup and the invite, so the destination
            // has to be threaded through it rather than used here.
            router.push(
                nextParam
                    ? `/onBoarding?next=${encodeURIComponent(nextParam)}`
                    : "/onBoarding"
            );
        } catch(error:any){
           
            console.log("signup failed, " + error.message)
        }finally{
            setloading(false);
        }

    }

    const  loaded=()=>{
        return( <div className={styles.card}>
                <span className={styles.brand}>Palate</span>
                <h1 className={styles.title}>Create your account</h1>
                <p className={styles.subtitle}>Join Palate to start deciding together</p>

                <label htmlFor="firstName" className={styles.label}>First Name</label>
                <input
                    id="firstName"
                    type="text"
                    placeholder="Alex"
                    className={styles.input}
                    value={user.firstName}
                    onChange={(e) => setuser({...user, firstName: e.target.value})}
                />
                <input
                    id="lastName"
                    type="text"
                    placeholder="smith"
                    className={styles.input}
                    value={user.lastName}
                    onChange={(e) => setuser({...user, lastName: e.target.value})}
                />
                <input
                    id="dob"
                    type="date"
                    placeholder=""
                    className={styles.input}
                    value={user.dob}
                    onChange={(e) => setuser({...user, dob: e.target.value})}
                />
                <input
                    id="phone"
                    type="tel"
                    placeholder=""
                    className={styles.input}
                    value={user.phone}
                    onChange={(e) => setuser({...user, phone: e.target.value})}
                />

                <label htmlFor="username" className={styles.label}>Username</label>
                <input
                    id="username"
                    type="text"
                    placeholder="yourname"
                    className={styles.input}
                    value={user.username}
                    onChange={(e) => setuser({...user, username: e.target.value})}
                />

                <label htmlFor="email" className={styles.label}>Email</label>
                <input
                    id="email"
                    type="text"
                    placeholder="you@example.com"
                    className={styles.input}
                    value={user.email}
                    onChange={(e) => setuser({...user, email: e.target.value})}
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
                <label htmlFor="confirmPassword" className={styles.label}>Confirm Password</label>
                <input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    className={styles.input}
                    value={user.ConfirmPassword}
                    onChange={(e) => setuser({...user, ConfirmPassword: e.target.value})}
                />

                <button
                    type="button"
                    className={styles.button}
                    onClick={onSignup}
                    disabled={buttonDisabled}
                >
                    {buttonDisabled ? "Cant Sign up yet" : "Sign Up"}
                </button>

                <p className={styles.footer}>
                    Already have an account?{" "}
                    <Link href={loginHref} className={styles.link}>Log in</Link>
                </p>
            </div>);
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
