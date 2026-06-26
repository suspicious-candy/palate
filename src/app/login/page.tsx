"use client"

import Link from "next/link";
import React from "react";
import {useRouter} from "next/navigation";
import axios from "axios"
import styles from "./login.module.css";
import { toast } from "react-hot-toast";

export default function LoginPage(){

    const [user,setuser]= React.useState({
        id: "",
        password: "",
    });

    const buttonDisabled = !(
        user.id.length > 2 &&
        user.password.length > 7
    );

    const [loading,setloading]= React.useState(false);
    

    const onLogin = async ()=>{

        try{
        
            setloading(true);
            const res = await toast.promise(axios.post("/api/user/login", user), {
                    loading: "Logining in your account...",
                    success: "Login Successful!! Redirecting...",
                    error: (err) => err.response?.data?.error ?? "Login failed",
                });
                    localStorage.setItem("userId", res.data.userId);
                    router.push("/onBoarding");
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
                <h1 className={styles.title}>Login in your account</h1>
                <p className={styles.subtitle}>Join Palate to start deciding together</p>


                <label htmlFor="id" className={styles.label}>Email</label>
                <input
                    id="id"
                    type="text"
                    placeholder="you@example.com"
                    className={styles.input}
                    value={user.id}
                    onChange={(e) => setuser({...user, id: e.target.value})}
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

                <button type="button" className={styles.button} onClick={onLogin}>Sign Up</button>

                <div className={styles.divider}>
                    <span>or</span>
                </div>

                <button type="button" className={styles.social}>Continue with Google</button>
                <button type="button" className={styles.social}>Continue with Apple</button>

                <p className={styles.footer}>
                    Not yet signed up?{" "}
                    <Link href="/signup" className={styles.link}>Sign up</Link>
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
