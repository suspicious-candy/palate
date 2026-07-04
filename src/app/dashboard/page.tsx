"use client";

import React from "react";
import axios from "axios";
import { toast } from "react-hot-toast";

type tip = { fsqTipId: string; text: string };
type participant = {
    user:User,
    hasVoted:boolean,
    rankedVotes: Restaurant[],
    votedAt:Date,
};
type matching = {
    name:string,
    participants:participant[],
    restaurants:Restaurant[],
    date:Date,
    status:string,
    winner:Restaurant,
};
type category = {
    fsqCategoryId: string;
    name: string;
    icon: { prefix: string; suffix: string };
};
type photo = {
    fsqPhotoId: string;
    prefix: string;
    suffix: string;
    width: number;
    height: number;
};

type Restaurant = {
    fsqId: string;
    name: string;
    categories: category[];
    geocodes: { latitude: number; longitude: number };
    geo: { type: string; coordinates: number[] };
    rating: number;
    price: number;
    tips: tip[];
    photos: photo[];
};

type User = {
    profilePic: string;
    firstName: string;
    lastName: string;
    visitedResturants: Restaurant[];
    wishlist: Restaurant[];
    preferences: {
        likedCuisines: { fsqid: number; name: string }[];
        disliked: string[];
        allergines: string[];
        diet: string[];
    };
    matchingGroup:{
        group:matching;
        isInMatching:boolean
    };
    lists:[Restaurant[]]
};

export default function Dashboard() {
    const [user, setUser] = React.useState<User | null>(null);
    const [loading, setLoading] = React.useState(true);

    const formattedDate = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    React.useEffect(() => {
        toast
            .promise(axios.get("/api/user/dashboard"), {
                loading: "Fetching user",
                success: "User fetch successful",
                error: (err) => err.response?.data?.error ?? "fetch failed",
            })
            .then((res) => setUser(res.data.user ?? null))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const loaded = () => (
        <div>
            <h2>{"Tonight's Table"}</h2>
            <h1>Where Shall we eat?</h1>
            <h2>
                {formattedDate}. {user?.firstName} {"& the crew"}
            </h2>
            {user?.matchingGroup.isInMatching ? (
                <div>
                    <p>{"I. Tonight's Feature"}</p>
                    <h1>Start a group Dinner</h1>
                    <p>
                        Share a QR, everyone swipes the same shortlist, Palate
                        serves the winner.
                    </p>
                    <button>Begin</button>
                </div>
            ) : (
                <div>
                    <p>I. Already on the Table</p>
                    <h1>Start a group Dinner</h1>
                    <p>
                        Share a QR, everyone swipes the same shortlist, Palate
                        serves the winner.
                    </p>
                    <button>Begin</button>
                </div>
            )}
        </div>
    );

    const notloaded = () => (
        <div>
            <p>notloaded</p>
        </div>
    );

    return <div>{loading ? notloaded() : loaded()}</div>;
}
