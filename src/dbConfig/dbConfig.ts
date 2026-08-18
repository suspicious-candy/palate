import mongoose from "mongoose";

// Caches the connection across hot reloads in dev, so a new connection is not
// opened — and sockets not leaked — on every request or file change.
type MongooseCache = {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = global as unknown as { _mongoose?: MongooseCache };

const cached: MongooseCache =
    globalForMongoose._mongoose ?? { conn: null, promise: null };

globalForMongoose._mongoose = cached;

export async function connect() {
    if (cached.conn) return cached.conn;

    if (!cached.promise) {
        if (!process.env.mongo_url) {
            throw new Error("mongo_url is not defined in the environment");
        }

        cached.promise = mongoose.connect(process.env.mongo_url, {
            // Fails fast at 5s rather than letting model calls buffer for 10s.
            serverSelectionTimeoutMS: 5000,
        });
    }

    try {
        cached.conn = await cached.promise;
    } catch (error) {
        // Reset so the next request retries rather than reusing a rejected promise.
        cached.promise = null;
        throw error;
    }

    return cached.conn;
}
