import mongoose from "mongoose";
await mongoose.connect(process.env.mongo_url.trim(), { serverSelectionTimeoutMS: 8000 });
const db = mongoose.connection.db;
const c = () => db.collection("users").countDocuments();
let prev = await c(), stable = 0;
for (let i = 0; i < 100 && stable < 4; i++) {
  await new Promise(r => setTimeout(r, 5000));
  const now = await c();
  stable = (now === prev) ? stable + 1 : 0;
  prev = now;
}
console.log("users settled at:", prev);
await mongoose.disconnect();
