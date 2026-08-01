"use client"
import React from "react";
import axios from "axios";

export type tip = { fsqTipId: string; text: string };

export type category = {
    fsqCategoryId: string;
    name: string;
    icon: { prefix: string; suffix: string };
};
export type Reservation = {
    _id:string;
    users:User[];
    restaurant:Restaurant;
    // JSON has no date type — this is an ISO string over the wire. Normalise
    // with `new Date(...)` before calling any Date method on it.
    date: string | Date;
    partySize:number;
    status:"confirmed"|"cancelled"|"completed";
    notes?:string;
};
export type Restaurant = {
    _id?: string;
    fsqId: string;
    name: string;
    categories: category[];
    cuisine?: string[];
    geocodes: { latitude: number; longitude: number };
    geo: { type: string; coordinates: number[] };
    rating: number;
    tips: tip[];
    location?: {
        formattedAddress?: string;
        locality?: string;
        region?: string;
    };
    // Not a field on the restaurant document — only present if a caller populates it.
    reservations?:Reservation[];
};

// Mirrors src/models/addressModel.js — `address` is a structured sub-object,
// not a single string.
export type Address = {
    _id: string;
    label?: "Home" | "Office";
    address: {
        aptNumber?: string;
        streetAddress: string;
        city: string;
        state: string;
        country: string;
        pincode?: number;
    };
};

// Mirrors src/models/userModel.js as returned by GET /api/user/dashboard.
// Fields the schema leaves without a default are optional here — a brand-new
// user who hasn't filled them in still has to render.
export type User = {
    _id:string;
    username: string;
    email: string;
    profilePic: string;
    firstName: string;
    lastName: string;
    phone?: string;
    dob?: string | Date;
    favDish?: string;
    numVisits?: number;
    firstOrderDate?: string | Date;
    StarmembershipStatus?: boolean;
    visitedResturants: Restaurant[];
    wishlist: Restaurant[];
    reservations:Reservation[];
    reservationHistory: Reservation[];
    savedAddresses: Address[];
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
    refreshUser: () => Promise<void>;
};

const userContext = React.createContext<UserContextValue>({
    user: null,
    setUser: () => {},
    loading: true,
    refreshUser: async () => {},
});

export function useUser(): UserContextValue {
    return React.useContext(userContext);
}

export function UserProvider({ children }:{ children: React.ReactNode }){
    const [user, setUser] = React.useState<User | null>(null);
    const [loading, setLoading] = React.useState(true);
    const refreshUser = React.useCallback(async () => {
    setLoading(true);
        try {
            const res = await axios.get("/api/user/dashboard");
            setUser(res.data.user ?? null);
        } catch (err: any) {
            setUser(null);
            console.error(
                "[userContext] /api/user/dashboard failed:",
                err?.response?.status,
                err?.response?.data ?? err?.message
            );
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => { refreshUser(); }, [refreshUser]);


    React.useEffect(()=>{
        axios.get("/api/user/dashboard")
            .then((res:any) => setUser(res.data.user ?? null))
            .catch((err:any) => {
            
                console.error(
                    "[userContext] /api/user/dashboard failed:",
                    err?.response?.status,
                    err?.response?.data ?? err?.message
                );
            })
            .finally(() => setLoading(false));
    }, []);

    return (
        <userContext.Provider value={{ user, setUser, loading,refreshUser  }}>
            {children}
        </userContext.Provider>
    );
}
