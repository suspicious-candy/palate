"use client"
import React from "react";
import axios from "axios";
import Reservation from "@/models/reservationModel";

export type tip = { fsqTipId: string; text: string };

export type category = {
    fsqCategoryId: string;
    name: string;
    icon: { prefix: string; suffix: string };
};
export type Reservation = {
    _id:number;
    users:User[];
    restaurant:Restaurant;
    date:Date;
    partySize:number;
    status:"confimed"|"cancelled"|"completed";
    notes:string;
};
export type Restaurant = {
    fsqId: string;
    name: string;
    categories: category[];
    geocodes: { latitude: number; longitude: number };
    geo: { type: string; coordinates: number[] };
    rating: number;
    tips: tip[];
    location?: { formattedAddress?: string };
    reservations:Reservation[];
};

export type User = {
    _id:number;
    profilePic: string;
    firstName: string;
    lastName: string;
    visitedResturants: Restaurant[];
    wishlist: Restaurant[];
    reservation:Reservation[];
    preferences: {
        likedCuisines: { fsqid: number; name: string }[];
        disliked: string[];
        allergines: string[];
        diet: string[];
    };
    matchingGroup:{
        group:matching;
        isInMatching: boolean;
    };
    friendlist:User[];
    lists: Record<string, Restaurant[]>;
};

export type participant = {
    user:User,
    hasVoted:boolean,
    rankedVotes: Restaurant[],
    votedAt:Date,
};
export type matching = {
    name:string,
    participants:participant[],
    restaurants:Restaurant[],
    date:Date,
    status:string,
    winner:Restaurant|null,
};

type UserContextValue = {
    user: User | null;
    setUser: React.Dispatch<React.SetStateAction<User | null>>;
    loading: boolean;
};

const userContext = React.createContext<UserContextValue>({
    user: null,
    setUser: () => {},
    loading: true,
});

export function useUser(): UserContextValue {
    return React.useContext(userContext);
}

export function UserProvider({ children }:{ children: React.ReactNode }){
    const [user, setUser] = React.useState<User | null>(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(()=>{
        axios.get("/api/user/dashboard")
            .then((res:any) => setUser(res.data.user ?? null))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    return (
        <userContext.Provider value={{ user, setUser, loading }}>
            {children}
        </userContext.Provider>
    );
}
