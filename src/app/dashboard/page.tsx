import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

export default async function Dashboard() {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    let userId: string | undefined;

    if (token && process.env.TOKEN_SECRET) {
        try {
            const decoded = jwt.verify(token, process.env.TOKEN_SECRET) as {
                id: string;
                username: string;
                role: string;
                email: string;
            };
            userId = decoded.id;
        } catch (error : any) {
            console.log(error.message);
        }
    }

    console.log("[dashboard] userId:", userId);

    return (
        <div>
            <h1>Dashboard</h1>
            <p>userId: {userId ?? "not logged in"}</p>
        </div>
    );
}
