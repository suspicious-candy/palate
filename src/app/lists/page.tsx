"use client";
import React from "react";
import { useGeo, GeoState } from "@/lib/GeolocationContext";
import { useUser, User, Restaurant, matching } from "@/lib/userContext";
import {RestaurantCard,handleList} from "@/app/dashboard/page"

export default function listPage(){
    const { user, setUser, loading } = useUser();
    const [isAdding,setIsAdding] = React.useState(false);
    const [listName,setListName] = React.useState("");
    const geo = useGeo();

    const loaded= ()=>{
        return (<div>
            <div>
                <h1>Your Lists</h1>
                <p>Everything you and the crew have saved</p>
            </div>
            <div>
                <h1>Your Wishlist</h1>
                {user?.wishlist.map((r,i)=>(
                     <RestaurantCard key={r.fsqId} restaurant={r} geo={geo} user={user} setUser={setUser} index={i} />
                ))}
            </div>
            <div>
                <h1>Your Lists</h1>
                {isAdding ?
                                <button  onClick={()=>{setIsAdding(!isAdding)}}>Done</button>
                                :<button  onClick={()=>{setIsAdding(!isAdding)}}>Edit</button>
                }
                {isAdding ? 
                            <div>
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        if (!listName.trim()) return;
                                        handleList(true, listName, setUser);
                                        setListName("");
                                    }}
                                >
                                    <input
                                        value={listName}
                                        onChange={(e) => setListName(e.target.value)}
                                        placeholder="New list name"
                                    />
                                    <button type="submit">Add</button>
                                </form>

                                {Object.keys(user?.lists ?? {}).length === 0 ?
                                    <p>No lists added yet</p>:
                                    Object.entries(user?.lists ?? {}).map(([name, restaurants]) => (
                                        <Listcard key={name} name={name} restaurants={restaurants} geo={geo} user={user} setUser={setUser}  />
                                    ))
                                }
                            </div>
                            :
                            Object.entries(user?.lists ?? {}).map(([name, restaurants]) => (
                                <Listcard key={name} name={name} restaurants={restaurants} geo={geo} user={user} setUser={setUser}  />
                            ))
                            
                }
            </div>
        </div>)
    }
    const notLoaded = ()=> {
        return(<div>
            <h1>Getting your lists ready... </h1>
        </div>)
    }
    return <div>{loading ? notLoaded() : loaded()}</div>;
}

function Listcard({ name, restaurants,geo,user,setUser}: { name: string; restaurants: Restaurant[]; user: User | null; setUser: React.Dispatch<React.SetStateAction<User | null>>;geo:GeoState } ){
    return (
        <div>
            <div>
                <h1>{name}</h1>
            </div>
            <div>
                {restaurants.length == 0 ?
                    <div>
                        <p>No resturants added yet?!</p>
                    </div> :
                    restaurants.map((r,i)=>(
                     <RestaurantCard key={r.fsqId} restaurant={r} geo={geo} user={user} setUser={setUser} index={i} />
                ))}
            </div>
        </div>
    )
}