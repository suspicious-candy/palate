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
     reservations?:Reservation[];
};

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
    /* The soonest group whose dinner has not passed, or null. Not a field on
       the user document — /api/user/dashboard attaches it from a query against
       the matching collection, so there is no pointer here to drift out of
       sync with participants[]. A user may be in several groups at once; this
       is the one worth showing. */
    matchingGroup: matching | null;
    friendlist:User[];
    lists: Record<string, Restaurant[]>;
};

export type participant = {
    user:FriendSummary,
    hasVoted:boolean,
    approvals: Restaurant[],
    votedAt:string | Date,
    /* Optional, not defaulted: a participant who has not opened the group — or
       who denied permission — has no coordinates at all. Modelling that as
       absent rather than as a zeroed point is what stops [0, 0] (a real place
       off West Africa) from ever reading as "unknown". */
    location?:{ type: "Point"; coordinates: [number, number] },
    locationAt?:string|Date
};
/* Someone who followed the invite link but was not auto-admitted. Shaped like
   PendingReq below rather than like `participant`: there is no vote, no
   location and no approvals until they are actually let in. */
export type pendingRequest = {
    user:FriendSummary,
    requestedAt:string | Date,
};
export type matching = {
    _id:string,
    admins:FriendSummary[],
    membershipOpen:boolean,
    /* Optional because it is: every group created before invite links existed
       has no code, and a plain `string` here would let callers assume one. */
    inviteCode?:string,
    name:string,
    participants:participant[],
    pendingRequests:pendingRequest[],
    restaurants:Restaurant[],
    date:string | Date,
    status:"open"|"voting"|"closed",
    winner:Restaurant|null,
};

type UserContextValue = {
    user: User | null;
    setUser: React.Dispatch<React.SetStateAction<User | null>>;
    loading: boolean;
    refreshUser: () => Promise<void>;
    refreshFriends:()=>Promise<void>;
    pending:PendingReq[];
    confirmed:FriendSummary[];
};

// Mirrors what listPending() actually sends: the friendship row plus the five
// user fields the route selects. Widening `user` to the full User would let
// callers reference fields the server never sends.
export type PendingReq = {
    user: Pick<User, "_id" | "username" | "firstName" | "lastName" | "profilePic">;
    _id:string;
    requestedAt:string | Date;
};
// listFriends() maps straight to user documents, so these arrive flat — there
// is no request left to wrap them in, unlike PendingReq above.
export type FriendSummary = Pick<User, "_id" | "username" | "firstName" | "lastName" | "profilePic">;

const userContext = React.createContext<UserContextValue>({
    user: null,
    setUser: () => {},
    loading: true,
    refreshUser: async () => {},
    refreshFriends:async ()=>{},
    pending:[],
    confirmed:[],
});

export function useUser(): UserContextValue {
    return React.useContext(userContext);
}

export function UserProvider({ children }:{ children: React.ReactNode }){
    const [user, setUser] = React.useState<User | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [pending,setPending] = React.useState<PendingReq[]>([]);
    const [confirmed,setConfirmed] = React.useState<FriendSummary[]>([]);
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

    const refreshFriends = React.useCallback(async () => {
        try {
            const res = await axios.get("/api/user/friends");
            setPending(res.data.pending ?? []);
            setConfirmed(res.data.confirmed ?? []);
        } catch (err: any) {
            setPending([]);
            setConfirmed([]);
            console.error(
                "[userContext] /api/user/friends failed:",
                err?.response?.status,
                err?.response?.data ?? err?.message
            );
        }
    }, []);

    React.useEffect(() => { refreshUser(); }, [refreshUser]);
    React.useEffect(() => { refreshFriends(); }, [refreshFriends]);

    return (
        <userContext.Provider value={{ user, setUser, loading, refreshUser,refreshFriends,pending,confirmed }}>
            {children}
        </userContext.Provider>
    );
}
