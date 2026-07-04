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

// Pure: how much time is left until `date`, formatted relative to `now`.
function timeLeft(date: Date, now: Date = new Date()): string {
    const diffMs = new Date(date).getTime() - now.getTime();

    if (diffMs <= 0) {
        return "Time's up";
    }

    const totalMinutes = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
}

function useTimeLeft(date: Date): string {
    const [now, setNow] = React.useState(() => new Date());

    React.useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(id); 
    }, []);

    return timeLeft(date, now);
}

function castedVotes(group?: matching): number {
    if (!group) return 0;
    let casted: number = 0;
    for (const userParticipant of group.participants) {
        if (userParticipant.hasVoted) {
            casted++;
        }
    }
    return casted;
}


export default function Dashboard() {
    const [user, setUser] = React.useState<User | null>(null);
    const [loading, setLoading] = React.useState(true);

    // Called unconditionally at the top level (Rules of Hooks). Falls back to
    // `now` until the group loads; re-renders every minute.
    const remaining = useTimeLeft(user?.matchingGroup?.group?.date ?? new Date());

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
            {!user?.matchingGroup.isInMatching ? (
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
                    <h1>{user?.matchingGroup.group.name}</h1>
                    {user?.matchingGroup?.group?.status === "open" ? (
                        <div>
                            <p>- Ready to vote</p>
                            <h2>{castedVotes(user?.matchingGroup?.group)} of {user?.matchingGroup?.group?.participants.length}</h2>
                            <h2>. {remaining}</h2>
                            <button>Begin the Voting</button>
                        </div>
                    ) : null}
                    {user?.matchingGroup?.group?.status === "voting" ? (
                        <div>
                            <p>- a live vote</p>
                            <h2>{user?.matchingGroup?.group?.winner?.name}</h2>
                            <h2>. {castedVotes(user?.matchingGroup?.group)} of {user?.matchingGroup?.group?.participants.length}</h2>
                            <h2>. {remaining}</h2>
                            <button>Cast your Vote</button>
                        </div>
                    ) : null}
                    {user?.matchingGroup?.group?.status === "closed" ? (
                        <div>
                            <p>- you found the Restaurant!!!</p>
                            <button>Cast your Vote</button>
                        </div>
                    ) : null}
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
