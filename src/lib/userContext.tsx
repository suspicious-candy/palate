"use client"
import React from "react";
import axios from "axios";
/* Side-effect import, not dead code. This registers the global axios response
   interceptor that rescues a dead session. Imported here because this provider
   is mounted in the root layout, so the interceptor is installed before the
   first request below goes out. */
import "@/lib/sessionExpiry";

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
    /* Whether the address on this account has been confirmed. Drives the badge
       and the resend button on the profile page, and mirrors the server-side
       check in withVerified, but it is display only. The gate that actually
       refuses a booking reads the database on every request; this flag is a copy
       in the browser and must never be what an authorization decision trusts. */
    isVerified?: boolean;
    /* IANA zone name, or "" for accounts that have not signed in since this was
       added. Server-side email rendering is the only consumer today, since the
       browser formats with the viewer's own zone implicitly. */
    timeZone?: string;
    visitedResturants: Restaurant[];
    wishlist: Restaurant[];
    reservations:Reservation[];
    reservationHistory: Reservation[];
    savedAddresses: Address[];
    preferences: {
        likedCuisines: { fsqid: number; name: string }[];
        allergines: string[];
        diet: string[];
    };
    /* The soonest group whose dinner has not passed, or null. Not a field on the
       user document: /api/user/dashboard attaches it from a query against the
       matching collection, so there is no pointer here to drift out of sync with
       participants[]. A user may be in several groups at once, and this is the
       one worth showing on the dashboard. */
    matchingGroup: matching | null;
    friendlist:User[];
    lists: Record<string, Restaurant[]>;
};

export type participant = {
    user:FriendSummary,
    hasVoted:boolean,
    approvals: Restaurant[],
    votedAt:string | Date,
    /* Optional rather than defaulted. A participant who has not opened the group,
       or who denied permission, has no coordinates at all. Modelling that as
       absent rather than as a zeroed point is what stops [0, 0] — a real place
       off West Africa — from ever reading as "unknown". */
    location?:{ type: "Point"; coordinates: [number, number] },
    locationAt?:string|Date
};
/* Someone who followed the invite link but was not auto-admitted. Shaped like
   PendingReq below rather than like `participant`, because there is no vote, no
   location and no approvals until they are actually let in. */
export type pendingRequest = {
    user:FriendSummary,
    requestedAt:string | Date,
};
/* Narrow on purpose. GROUP_POPULATE fills this one level deep, so the
   reservation's own `restaurant` and `users` are still raw ObjectIds. Typing it
   as the full Reservation would claim fields the populate chain does not fill,
   and `group.reservation.restaurant.name` would typecheck while being undefined
   at runtime. The group screen only needs to know the table exists and when;
   /reservation is where the whole booking lives. */
export type groupReservation = {
    _id:string,
    date:string|Date,
    partySize:number,
    // The model's enum rather than a bare string, so a typo cannot compare equal.
    status:"confirmed"|"cancelled"|"completed",
};

export type matching = {
    _id:string,
    admins:FriendSummary[],
    membershipOpen:boolean,
    /* Genuinely optional: every group created before invite links existed has no
       code, and a plain `string` here would let callers assume one. */
    inviteCode?:string,
    name:string,
    participants:participant[],
    pendingRequests:pendingRequest[],
    restaurants:Restaurant[],
    date:string | Date,
    status:"open"|"voting"|"closed",
    winner:Restaurant|null,
    reservation: groupReservation | null,
};

/* What the groups list receives, which is deliberately less than `matching`.

   A list row needs a name, a date, a status, avatars and "3 of 5 voted". It does
   not need every participant's ballot, the whole shortlist, or the reservation,
   and populating those for every group a user has ever joined ships tens of KB
   that nothing on the page reads.

   The cost of the smaller shape is that the pure helpers divide in two.
   votingClosesAt, groupIsStale, votedCount and totalCount accept this, while
   tally, leader and closeVote do not: those key restaurants by `fsqId`, which a
   bare ObjectId does not have. That split is why the list route re-fetches a
   group in full before it closes anything. */
export type GroupSummary = {
    _id: string;
    name: string;
    date: string | Date;
    status: "open" | "voting" | "closed";
    /* Raw ObjectIds rather than populated users. They serialize to strings over
       JSON, and the list only ever asks whether the viewer is among them. */
    admins: string[];
    participants: { user: FriendSummary; hasVoted: boolean }[];
    /* Populated, but only far enough to name it: a closed group's row says
       where you went. */
    winner: { _id: string; name: string } | null;
    /* Ids only. The row shows how many are on the shortlist, never which. */
    restaurants: string[];
    reservation: string | null;
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

// Mirrors what listPending() actually sends: the friendship row plus the user
// fields the route selects. Widening `user` to the full User would let callers
// reference fields the server never sends.
export type PendingReq = {
    user: Pick<User, "_id" | "username" | "firstName" | "lastName" | "profilePic">;
    _id:string;
    requestedAt:string | Date;
};
// listFriends() maps straight to user documents, so these arrive flat. There is
// no request left to wrap them in, unlike PendingReq above.
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
