import { MongoClient, ServerApiVersion } from "mongodb";
import { ATLAS_URI } from "./config";

let _db: any = null;

export async function connectDB() {
  if (_db) return _db;                     // already connected

  // ---- 1. Validate URI format ----
  if (!ATLAS_URI?.startsWith("mongodb://") && !ATLAS_URI?.startsWith("mongodb+srv://")) {
    throw new Error(
      "Invalid MongoDB URI. Must start with 'mongodb://' or 'mongodb+srv://'."
    );
  }

  // ---- 2. Create client ----
  const client = new MongoClient(ATLAS_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  try {
    // ---- 3. Connect + ping ----
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB Atlas");

    // ---- 4. Set DB and export ----
    _db = client.db("Wearable");
    return _db;
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  }
}

/**
 * Exported DB – use only after `await connectDB()` somewhere (e.g. in server.ts)
 */
export const db = {
  get collection() {
    if (!_db) throw new Error("DB not connected. Call connectDB() first.");
    return (name: string) => _db.collection(name);
  },
};