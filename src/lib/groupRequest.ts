import type { matching } from "@/lib/userContext";
import { groupIsStale } from "./groupVote";
export type RequestOutcome =
    | "group_not_found"
    | "not_admin"
    | "already_participant"
    | "not_pending"
    | "group_closed"
    | "dinner_passed"
    | "approved"
    | "denied";

function pendingOf(group: matching): matching["pendingRequests"] {
    return group.pendingRequests ?? [];
}

export function requestVerdict(targetId:string, group:matching|null, isAdmin:boolean, action: "approve" | "deny"): RequestOutcome{
   
    if (!group) return "group_not_found";
    if(!isAdmin) return "not_admin";
    
    const inGrp = group.participants.some((a)=>(a.user?._id?.toString()===targetId));
    const inPending = pendingOf(group).some((a)=>(a.user?._id?.toString()===targetId));

    if(!inPending && inGrp) return "already_participant"
    if(!inPending)return "not_pending";
    if(action==="deny") return "denied"
    if(group.status==="closed") return "group_closed"
    if(groupIsStale(group)) return "dinner_passed"

    return "approved";
}
