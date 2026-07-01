"use client";

import Link from "next/link";
import React from "react";
import {useRouter} from "next/navigation";
import axios from "axios"
import { toast } from "react-hot-toast";


type LikedCuisine = { fsqid: number; name: string };

export default function Dashboard() {
    
    const [likedCuisines, setLikedCuisines] = React.useState<LikedCuisine[]>([]);
    React.useEffect(() => {
        toast.promise(axios.get("/api/user/dashboard"), {
                loading: "Fetching preferences",
                success: "Preference fetch successful",
                error: (err) => err.response?.data?.error ?? "fetch failed",
            })
            .then((res) => {
                setLikedCuisines(res.data.preferences?.likedCuisines ?? []);
            })
            .catch(() => {
            });
    }, []);

    return (
        <div>
            <h1>Dashboard</h1>
            {likedCuisines.map((c) => (
                <h2 key={c.fsqid}>{c.name}</h2>
            ))}
        </div>
    );
}