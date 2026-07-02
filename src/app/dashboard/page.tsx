"use client";

import Link from "next/link";
import React from "react";
import {useRouter} from "next/navigation";
import axios from "axios"
import { toast } from "react-hot-toast";



type LikedCuisine = { fsqid: number; name: string };
type tip = {fsqTipId:string,text:string};
type category = {
    fsqCategoryId: string,
    name: string, 
    icon: {
      prefix: string,
      suffix: string,
    },
}
type photo = {
    fsqPhotoId: string,
    prefix: string,
    suffix: string,
    width: number,
    height: number,
}

type Restaurant = {

    fsqId:number,
    name:string,
    category:category,
    geocodes:{
        latitude:string,
        longitude:string
    },
     geo: {
      type: { type: string, enum: ["Point"], default: "Point" },
      coordinates: { type: [number] }, // [lng, lat]
    },
    rating:number,
    price:number,
    tips:[tip],
    photo:[photo]

};

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
            <div>
                <h1>Filters</h1>
                <h2>Sort By</h2>
                <div>
                    <button>Recommanded</button>
                    
                </div>
            </div>
            {likedCuisines.map((c) => (
                <h2 key={c.fsqid}>{c.name}</h2>
            ))}
        </div>
    );
}