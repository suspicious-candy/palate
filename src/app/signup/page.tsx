"use client"

import Link from "next/link";
import React, { useEffect } from "react";
import {useRouter} from "next/navigation";
import axios from "axios"

export default function SignupPage(){

    const router = useRouter();
    const[buttonDisabled,setbuttonDisabled] = React.useState(true);
    const [user,setuser]= React.useState({
        email: "",
        password: "",
        ConfirmPassword: "",
        username: "",
    });

    const onSignup = async ()=>{



    }

    useEffect(()=>{
        const isValid =
        user.email.length > 0 &&
        user.password.length > 7 &&
        user.username.length > 2 &&
        user.password === user.ConfirmPassword;

        setbuttonDisabled(!isValid);
    },[user])

    return(
        <div className="signup-screen">
            <div className="signup-card">
                <span className="signup-brand">Palate</span>
                <h1 className="signup-title">Create your account</h1>
                <p className="signup-subtitle">Join Palate to start deciding together</p>

                <label htmlFor="username" className="signup-label">Username</label>
                <input
                    id="username"
                    type="text"
                    placeholder="yourname"
                    className="signup-input"
                    value={user.username}
                    onChange={(e) => setuser({...user, username: e.target.value})}
                />

                <label htmlFor="email" className="signup-label">Email</label>
                <input
                    id="email"
                    type="text"
                    placeholder="you@example.com"
                    className="signup-input"
                    value={user.email}
                    onChange={(e) => setuser({...user, email: e.target.value})}
                />

                <label htmlFor="password" className="signup-label">Password</label>
                <input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="signup-input"
                    value={user.password}
                    onChange={(e) => setuser({...user, password: e.target.value})}
                />
                <label htmlFor="confirmPassword" className="signup-label">Confirm Password</label>
                <input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="signup-input"
                    value={user.ConfirmPassword}
                    onChange={(e) => setuser({...user, ConfirmPassword: e.target.value})}
                />

                <button type="button" className="signup-button" onClick={onSignup}>Sign Up</button>

                <div className="signup-divider">
                    <span>or</span>
                </div>

                <button type="button" className="signup-social">Continue with Google</button>
                <button type="button" className="signup-social">Continue with Apple</button>

                <p className="signup-footer">
                    Already have an account?{" "}
                    <Link href="/login" className="signup-link">Log in</Link>
                </p>
            </div>

            <style jsx>{`
                .signup-screen {
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background-color: #1c0d09;
                    background-image: url("/resturant.jpg");
                    background-position: center center;
                    background-repeat: no-repeat;
                    background-size: cover;
                    padding: 24px 16px;
                }

                .signup-card {
                    width: 100%;
                    max-width: 380px;
                    display: flex;
                    flex-direction: column;
                    background: #ffffff;
                    border-radius: 20px;
                    border: 1px solid rgba(0, 0, 0, 0.06);
                    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04);
                    padding: 28px 26px 26px;
                    box-sizing: border-box;
                }

                .signup-brand {
                    font-size: 26px;
                    font-weight: 700;
                    letter-spacing: -0.6px;
                    color: #c1272d;
                }

                .signup-title {
                    font-size: 24px;
                    font-weight: 600;
                    color: #1a1a1a;
                    margin: 22px 0 6px;
                }

                .signup-subtitle {
                    font-size: 14px;
                    color: #777;
                    margin: 0 0 24px;
                }

                .signup-label {
                    font-size: 12px;
                    font-weight: 500;
                    color: #3a3a3a;
                    margin-bottom: 6px;
                }

                .signup-input {
                    height: 48px;
                    padding: 0 14px;
                    border: 1px solid #e3e3e3;
                    border-radius: 12px;
                    font-size: 14px;
                    color: #1a1a1a;
                    background: #fafafa;
                    outline: none;
                    margin-bottom: 16px;
                    transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
                }

                .signup-input::placeholder {
                    color: #b0b0b0;
                }

                .signup-input:focus {
                    border-color: #c1272d;
                    background: #ffffff;
                    box-shadow: 0 0 0 3px rgba(193, 39, 45, 0.15);
                }

                .signup-button {
                    height: 52px;
                    margin-top: 8px;
                    border: none;
                    border-radius: 14px;
                    background: #a41e22;
                    color: #ffffff;
                    font-size: 16px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: background 0.15s, transform 0.05s;
                }

                .signup-button:hover {
                    background: #8e1a1d;
                }

                .signup-button:active {
                    transform: scale(0.99);
                }

                .signup-divider {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin: 22px 0;
                    color: #9a9a9a;
                    font-size: 12px;
                }

                .signup-divider::before,
                .signup-divider::after {
                    content: "";
                    flex: 1;
                    height: 1px;
                    background: #ececec;
                }

                .signup-social {
                    height: 50px;
                    border: 1px solid #e3e3e3;
                    border-radius: 14px;
                    background: #ffffff;
                    color: #3a3a3a;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    margin-bottom: 12px;
                    transition: background 0.15s;
                }

                .signup-social:hover {
                    background: #fafafa;
                }

                .signup-footer {
                    text-align: center;
                    font-size: 13px;
                    color: #777;
                    margin: 16px 0 0;
                }

                .signup-link {
                    color: #c1272d;
                    font-weight: 500;
                    text-decoration: none;
                }

                .signup-link:hover {
                    text-decoration: underline;
                }
            `}</style>
        </div>
    )
}
