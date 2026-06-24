import mongoose from "mongoose";

// Cache the connection across hot-reloads in dev so we don't open a new
// connection (and leak sockets) on every request / file change.
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
            // Fail fast (5s) instead of letting model calls buffer for 10s.
            serverSelectionTimeoutMS: 5000,
        });
    }

    try {
        cached.conn = await cached.promise;
    } catch (error) {
        // Reset so the next request can retry instead of reusing a rejected promise.
        cached.promise = null;
        throw error;
    }

    return cached.conn;
}
