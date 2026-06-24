"use client"

import Link from "next/link";
import React from "react";
import {useRouter} from "next/navigation";
import axios from "axios"
import styles from "./login.module.css";

export default function LoginPage(){

    const [user,setuser]= React.useState({
        email: "",
        password: "",
    });

    const onLogin = async ()=>{

    }

    return(
        <div className={styles.screen}>
            <div className={styles.card}>
                <span className={styles.brand}>Palate</span>
                <h1 className={styles.title}>Create your account</h1>
                <p className={styles.subtitle}>Join Palate to start deciding together</p>


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
        </div>
    )
}
