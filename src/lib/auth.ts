import jwt from "jsonwebtoken";

type TokenPayload = {
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