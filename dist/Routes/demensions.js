// Routes/dimensions.ts
import express from "express";
import { db } from "../DB/Connection.js";
const router = express.Router();
/* ---------- GET ALL CLAIM STATUSES ---------- */
router.get("/claim-status", async (_req, res) => {
    try {
        console.log("Fetching claim statuses...");
        const statuses = await db.collection("Claim_Status").find({}).toArray();
        console.log("Found statuses:", statuses.length);
        res.status(200).json(statuses);
    }
    catch (error) {
        console.error("Error fetching claim statuses:", error);
        res.status(500).json({ message: "Error fetching claim statuses", error });
    }
});
/* ---------- GET ALL CLAIM TYPES ---------- */
router.get("/claim-types", async (_req, res) => {
    try {
        console.log("Fetching claim types...");
        const types = await db.collection("Claim_Type").find({}).toArray();
        console.log("Found types:", types.length);
        res.status(200).json(types);
    }
    catch (error) {
        console.error("Error fetching claim types:", error);
        res.status(500).json({ message: "Error fetching claim types", error });
    }
});
/* ---------- GET USER-APPROVER MAPPINGS ---------- */
router.get("/user-approver-map", async (req, res) => {
    try {
        console.log("Fetching user-approver mappings...");
        const { approverId } = req.query;
        const filter = approverId ? { ApproverID: approverId } : {};
        const mappings = await db.collection("User_Approver_Map").find(filter).toArray();
        console.log("Found mappings:", mappings.length);
        res.status(200).json(mappings);
    }
    catch (error) {
        console.error("Error fetching user-approver mappings:", error);
        res.status(500).json({ message: "Error fetching mappings", error });
    }
});
export default router;
