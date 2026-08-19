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

            /* THE NUMBER THAT MATTERS ON SERVERLESS.

               Mongoose defaults maxPoolSize to 100. That is a sensible default
               for one long-lived server, and actively dangerous on a platform
               that runs many isolates: the cache above is per-isolate, so every
               concurrent instance opens its OWN pool of up to 100. The Atlas
               cluster this app talks to allows 500 connections in total
               (measured: 15 in use, 485 available), so five cold instances
               answering a traffic spike can exhaust the cluster between them —
               and the failure is the worst kind, because it arrives exactly when
               traffic is highest and looks like a database outage rather than a
               configuration default.

               10 is ample for one isolate. A serverless invocation handles one
               request at a time, and the pool only needs enough headroom for the
               handful of queries a single request runs concurrently — the
               dashboard's populate chain is the widest, and it is nowhere near
               ten. Fifty instances now cost 500 connections rather than five
               doing so.

               Revisit only alongside the cluster tier: this number times the
               instance ceiling must stay under the connection limit. */
            maxPoolSize: 10,

            /* Idle sockets are returned to the OS rather than held open by an
               isolate the platform froze between invocations. Without it a
               scaled-down instance can keep connections checked out at the
               cluster while doing nothing. */
            maxIdleTimeMS: 60_000,
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
