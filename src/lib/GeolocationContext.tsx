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
        /* The unsupported branch used to call setState right here, synchronously
           inside the effect. Every other path into this state arrives through a
           getCurrentPosition callback — that is, in a later task — and this one
           did not, which cost a second render of the whole tree before paint
           (this provider wraps the app) and is what react-hooks/set-state-in-effect
           objects to.

           Reporting it through the same error callback the browser would use
           makes both paths the same shape. A cleared timeout on unmount so a
           provider torn down in the same tick does not set state afterwards. */
        if (!("geolocation" in navigator)) {
            const id = setTimeout(
                () => setState({
                    status: "error",
                    message: "Geolocation is not supported by this browser",
                }),
                0
            );
            return () => clearTimeout(id);
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
                enableHighAccuracy: false, // city-level precision is enough, and avoids a slow GPS fix
                timeout: 10000,
                maximumAge: 5 * 60 * 1000, // reuses a fix from the last 5 minutes rather than re-prompting the OS
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