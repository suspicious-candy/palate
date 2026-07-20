"use client"
import React from "react";

export type GeoState =
    | { status: "loading" }
    | { status: "success"; latitude: number; longitude: number }
    | { status: "error"; message: string };

const GeolocationContext = React.createContext<GeoState>({ status: "loading" });

export function GeolocationProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = React.useState<GeoState>({ status: "loading" });



    React.useEffect(() => {
        if (!("geolocation" in navigator)) {
            setState({ status: "error", message: "Geolocation is not supported by this browser" });
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setState({
                    status: "success",
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
            },
            (error) => {
                setState({ status: "error", message: error.message || "Location permission denied" });
            },
            {
                enableHighAccuracy: false, // city-level precision is enough; avoids a slow GPS fix
                timeout: 10000,
                maximumAge: 5 * 60 * 1000, // reuse a fix from the last 5 minutes instead of re-prompting the OS
            }
        );
    }, []);

   

    return (
        <GeolocationContext.Provider value={state}>
            {children}
        </GeolocationContext.Provider>
    );
}
export function useGeo(): GeoState {
    return React.useContext(GeolocationContext);
}