import jwt from "jsonwebtoken";

/* Exported because withAuth hands it to every route handler — one definition,
   so a claim added to the token cannot drift out of sync with what routes
   believe they are given. */
export type TokenPayload = {
    id: string;
    username: string;
    role: string;
    email: string;
};

export function getUserFromToken(token: string | undefined): TokenPayload | null {
    
    if (!token || !process.env.TOKEN_SECRET) {
        
        return null;

    }
    try {

        return jwt.verify(token, process.env.TOKEN_SECRET) as TokenPayload;

    } catch {

        return null;

    }
}