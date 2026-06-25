"use client"

import Link from "next/link";
import React from "react";
import {useRouter} from "next/navigation";
import axios from "axios"
import styles from "./signup.module.css";
import { toast } from "react-hot-toast";

export default function SignupPage(){

    const router = useRouter();
    const [user,setuser]= React.useState({
        email: "",
        password: "",
        ConfirmPassword: "",
        username: "",
    });

    const buttonDisabled = !(
        user.email.length > 0 &&
        user.password.length > 7 &&
        user.username.length > 2 &&
        user.password === user.ConfirmPassword
    );

    const [loading,setloading]= React.useState(false);

    const onSignup = async ()=>{

        try{

            setloading(true);
            const res = await toast.promise(axios.post("/api/user/signup", user), {
                loading: "Creating your account...",
                success: "Account created! Redirecting...",
                error: (err) => err.response?.data?.error ?? "Signup failed",
            });
            // No auth/session yet — stash the new user's id so the onboarding
            // page can attach preferences to the right account.
            localStorage.setItem("userId", res.data.userId);
            router.push("/onBoarding");
        } catch(error:any){
            // toast.promise already showed the error toast; just log here.
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

                <div className={styles.divider}>
                    <span>or</span>
                </div>

                <button type="button" className={styles.social}>Continue with Google</button>
                <button type="button" className={styles.social}>Continue with Apple</button>

                <p className={styles.footer}>
                    Already have an account?{" "}
                    <Link href="/login" className={styles.link}>Log in</Link>
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
