"use client"

import Link from "next/link";
import React from "react";
import {useRouter} from "next/navigation";
import axios from "axios"

export default function LoginPage(){

    const [user,setuser]= React.useState({
        email: "",
        password: "",
    });

    const onLogin = async ()=>{

    }

    return(
        <div className="login-screen">
            <div className="login-card">
                <span className="login-brand">Palate</span>
                <h1 className="login-title">Create your account</h1>
                <p className="login-subtitle">Join Palate to start deciding together</p>


                <label htmlFor="email" className="login-label">Email</label>
                <input
                    id="email"
                    type="text"
                    placeholder="you@example.com"
                    className="login-input"
                    value={user.email}
                    onChange={(e) => setuser({...user, email: e.target.value})}
                />

                <label htmlFor="password" className="login-label">Password</label>
                <input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="login-input"
                    value={user.password}
                    onChange={(e) => setuser({...user, password: e.target.value})}
                />

                <button type="button" className="login-button" onClick={onLogin}>Sign Up</button>

                <div className="login-divider">
                    <span>or</span>
                </div>

                <button type="button" className="login-social">Continue with Google</button>
                <button type="button" className="login-social">Continue with Apple</button>

                <p className="login-footer">
                    Not yet signed up?{" "}
                    <Link href="/signup" className="login-link">Sign up</Link>
                </p>
            </div>

            <style jsx>{`
                .login-screen {
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

                .login-card {
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

                .login-brand {
                    font-size: 26px;
                    font-weight: 700;
                    letter-spacing: -0.6px;
                    color: #c1272d;
                }

                .login-title {
                    font-size: 24px;
                    font-weight: 600;
                    color: #1a1a1a;
                    margin: 22px 0 6px;
                }

                .login-subtitle {
                    font-size: 14px;
                    color: #777;
                    margin: 0 0 24px;
                }

                .login-label {
                    font-size: 12px;
                    font-weight: 500;
                    color: #3a3a3a;
                    margin-bottom: 6px;
                }

                .login-input {
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

                .login-input::placeholder {
                    color: #b0b0b0;
                }

                .login-input:focus {
                    border-color: #c1272d;
                    background: #ffffff;
                    box-shadow: 0 0 0 3px rgba(193, 39, 45, 0.15);
                }

                .login-button {
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

                .login-button:hover {
                    background: #8e1a1d;
                }

                .login-button:active {
                    transform: scale(0.99);
                }

                .login-divider {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin: 22px 0;
                    color: #9a9a9a;
                    font-size: 12px;
                }

                .login-divider::before,
                .login-divider::after {
                    content: "";
                    flex: 1;
                    height: 1px;
                    background: #ececec;
                }

                .login-social {
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

                .login-social:hover {
                    background: #fafafa;
                }

                .login-footer {
                    text-align: center;
                    font-size: 13px;
                    color: #777;
                    margin: 16px 0 0;
                }

                .login-link {
                    color: #c1272d;
                    font-weight: 500;
                    text-decoration: none;
                }

                .login-link:hover {
                    text-decoration: underline;
                }
            `}</style>
        </div>
    )
}
