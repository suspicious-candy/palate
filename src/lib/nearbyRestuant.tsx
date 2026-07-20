"use client"
import React from "react";
import axios from "axios";
import { useGeo } from "@/lib/GeolocationContext";

type tip = { fsqTipId: string; text: string };

type category = {
    fsqCategoryId: string;
    name: string;
    icon: { prefix: string; suffix: string };
};
type Restaurant = {
    fsqId: string;
    name: string;
    categories: category[];
    geocodes: { latitude: number; longitude: number };
    geo: { type: string; coordinates: number[] };
    rating: number;
    tips: tip[];
    location?: { formattedAddress?: string };
};

const NearbyRestaurantsContext = React.createContext<Restaurant[]>([]);
export function useNearbyRestaurants(): Restaurant[] {
    return React.useContext(NearbyRestaurantsContext);
}
export function NearbyRestaurantsProvider({ children }:{ children: React.ReactNode }){
    const [state, setState] = React.useState<Restaurant[]>([]);
    const geo = useGeo();

    React.useEffect(()=>{
        if (geo.status !== "success") return;

        axios.get("/api/Restaurants/nearby", { params: { lat: geo.latitude, lng: geo.longitude } })
        .then((res:any) => setState(res.data.restaurants ?? []))
            .catch(() => {});
        }, [geo]);

    return (<NearbyRestaurantsContext.Provider value={state}>{children}</NearbyRestaurantsContext.Provider>);
}