// src/config.ts
import dotenv from "dotenv";
dotenv.config();

export const ATLAS_URI = process.env.ATLAS_URI;

if (!ATLAS_URI) {
  throw new Error("ATLAS_URI is missing in .env");
}

console.log("URI loaded:", ATLAS_URI.slice(0, 30) + "..."); // DEBUG