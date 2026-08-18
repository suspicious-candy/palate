"use client"
import {matching} from "./userContext"
import { useGeo } from "./GeolocationContext"
import React from "react";
import axios from "axios";

export function useReportGroupLocation(group:matching|null){
    const geo = useGeo();
    const groupId = group?._id ?? null;
    const groupStatus = group?.status ?? null;
    const lng = geo.status==="success" ? geo.longitude:null;
    const lat = geo.status==="success" ? geo.latitude:null;

    const reportedFor = React.useRef<string|null>(null)

    React.useEffect(()=>{
        if(groupId===null || groupStatus==="closed" || lat === null || lng === null || reportedFor.current === groupId){
            return;
        };
        /* Claimed before the request rather than after. React's Strict Mode runs
           this effect twice in development, and an await between the check above
           and this line would let both runs past the guard. */
        reportedFor.current = groupId

        /* .catch rather than try/catch: the call is not awaited, so the try block
           has already exited by the time the request fails. */
        axios.patch(`/api/user/matching/${groupId}/location`, {coord:{lng,lat}})
            .catch((err:any)=>{
                console.error(
                    "[useReportGroupLocation] PATCH failed:",
                    err?.response?.status,
                    err?.response?.data ?? err?.message
                );
                // The claim did not hold, so let a later legitimate run retry.
                reportedFor.current = null
            });
    },[groupId, groupStatus, lat, lng]);

}