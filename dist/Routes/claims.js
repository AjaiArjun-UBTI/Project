import express from "express";
import { db } from "../DB/Connection.js";
import { ObjectId } from "mongodb";
const router = express.Router();
/* ---------- HELPER: Get users under an approver ---------- */
async function getUsersUnderApprover(approverId) {
    const mapping = await db
        .collection("User_Approver_Map")
        .findOne({ ApproverID: approverId });
    return mapping?.UserID || [];
}
/* ---------- HELPER: Enrich claims with dimension data ---------- */
async function enrichClaimsWithDimensions(claims) {
    const statuses = await db.collection("Claim_Status").find({}).toArray();
    const types = await db.collection("Claim_Type").find({}).toArray();
    const statusMap = new Map(statuses.map((s) => [s.R_NO, s.S_Desc]));
    const typeMapByRNO = new Map(types.map((t) => [t.R_NO, t.T_Desc]));
    return claims.map((claim) => {
        const statusDesc = statusMap.get(claim.status) || "Unknown";
        const typeDesc = typeMapByRNO.get(claim.Type) || "Unknown";
        return {
            ...claim,
            StatusDescription: statusDesc,
            TypeDescription: typeDesc,
        };
    });
}
/* ---------- GET MY CLAIMS (User's own claims) ---------- */
router.get("/", async (req, res) => {
    try {
        const { userId, tenantId } = req.query;
        if (!userId) {
            return res.status(400).json({ message: "userId is required" });
        }
        const filter = { userID: userId.toString() };
        if (tenantId)
            filter.tenantID = tenantId.toString();
        const claims = await db.collection("claims").find(filter).toArray();
        const enrichedClaims = await enrichClaimsWithDimensions(claims);
        res.status(200).json(enrichedClaims);
    }
    catch (error) {
        console.error("Error fetching claims:", error);
        res.status(500).json({ message: "Error fetching claims", error });
    }
});
/* ---------- GET CLAIMS FOR APPROVAL (Approver/Admin) ---------- */
router.get("/for-approval", async (req, res) => {
    try {
        const { userId, role, tenantId } = req.query;
        if (!userId || !role) {
            return res.status(400).json({ message: "userId and role are required" });
        }
        let filter = {};
        if (tenantId)
            filter.tenantID = tenantId.toString();
        if (role === "Approver") {
            // Approvers see ALL claims from their assigned users (not just pending)
            const userIds = await getUsersUnderApprover(userId.toString());
            filter.userID = { $in: userIds };
            // NO status filter - show ALL claims from their team
        }
        else if (role === "Admin") {
        }
        else {
            return res.status(403).json({ message: "Only Approvers and Admins can access this endpoint" });
        }
        const claims = await db.collection("claims").find(filter).toArray();
        const enrichedClaims = await enrichClaimsWithDimensions(claims);
        res.status(200).json(enrichedClaims);
    }
    catch (error) {
        console.error("Error fetching claims for approval:", error);
        res.status(500).json({ message: "Error fetching claims", error });
    }
});
/* ---------- GET ONE CLAIM ---------- */
router.get("/:id", async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: "Invalid claim ID format" });
        }
        const claim = await db
            .collection("claims")
            .findOne({ _id: new ObjectId(req.params.id) });
        if (!claim) {
            return res.status(404).json({ message: "Claim not found" });
        }
        const enrichedClaim = await enrichClaimsWithDimensions([claim]);
        res.status(200).json(enrichedClaim[0]);
    }
    catch (error) {
        console.error("Error fetching claim:", error);
        res.status(500).json({ message: "Error fetching claim", error });
    }
});
/* ---------- CREATE CLAIM ---------- */
router.post("/", async (req, res) => {
    try {
        if (!req.body.Title || !req.body.Description) {
            return res.status(400).json({
                message: "Title and description are required"
            });
        }
        const newClaim = {
            Title: req.body.Title,
            Description: req.body.Description,
            status: 2, // Always starts as Pending
            tenantID: req.body.tenantID,
            userID: req.body.userID,
            Claim_Creation_Date: new Date(),
            Claim_Date: req.body.Claim_Date ? new Date(req.body.Claim_Date) : new Date(),
            Type: req.body.Type, // R_NO from Claim_Type
            Amount: req.body.Amount || 0,
            ReceiptID: req.body.ReceiptID || null,
        };
        const result = await db.collection("claims").insertOne(newClaim);
        res.status(201).json({
            message: "Claim created successfully",
            claimId: result.insertedId,
            claim: { ...newClaim, _id: result.insertedId }
        });
    }
    catch (error) {
        console.error("Error creating claim:", error);
        res.status(500).json({ message: "Error creating claim", error });
    }
});
/* ---------- UPDATE CLAIM ---------- */
router.patch("/:id", async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: "Invalid claim ID format" });
        }
        const updates = { updatedAt: new Date() };
        if (req.body.Title !== undefined)
            updates.Title = req.body.Title;
        if (req.body.Description !== undefined)
            updates.Description = req.body.Description;
        if (req.body.Claim_Date !== undefined)
            updates.Claim_Date = new Date(req.body.Claim_Date);
        if (req.body.Type !== undefined)
            updates.Type = req.body.Type;
        if (req.body.Amount !== undefined)
            updates.Amount = req.body.Amount;
        const result = await db
            .collection("claims")
            .updateOne({ _id: new ObjectId(req.params.id) }, { $set: updates });
        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "Claim not found" });
        }
        res.status(200).json({
            message: "Claim updated successfully",
            modifiedCount: result.modifiedCount
        });
    }
    catch (error) {
        console.error("Error updating claim:", error);
        res.status(500).json({ message: "Error updating claim", error });
    }
});
/* ---------- DELETE CLAIM ---------- */
router.delete("/:id", async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: "Invalid claim ID format" });
        }
        const result = await db
            .collection("claims")
            .deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Claim not found" });
        }
        res.status(200).json({
            message: "Claim deleted successfully",
            deletedCount: result.deletedCount
        });
    }
    catch (error) {
        console.error("Error deleting claim:", error);
        res.status(500).json({ message: "Error deleting claim", error });
    }
});
/* ---------- APPROVE/REJECT CLAIM ---------- */
/* ---------- APPROVE/REJECT CLAIM ---------- */
router.patch("/:id/status", async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: "Invalid claim ID format" });
        }
        const { status, userRole, userId } = req.body;
        const claim = await db.collection("claims").findOne({ _id: new ObjectId(req.params.id) });
        if (!claim) {
            return res.status(404).json({ message: "Claim not found" });
        }
        let newStatus;
        const updateFields = { updatedAt: new Date() };
        if (userRole === "Approver") {
            if (status === "approve") {
                // ✅ FIXED: Allow Approvers to approve:
                // - status 2 (Pending)
                // - status 3 (Rejected by Approver - they can reverse their own decision)
                // - status 4 (Rejected by Admin - they can re-approve after admin rejection)
                if (claim.status !== 2 && claim.status !== 3 && claim.status !== 4) {
                    return res.status(400).json({
                        message: "Approver can only approve pending, self-rejected, or admin-rejected claims"
                    });
                }
                newStatus = 1; // Approved - Level 1
                updateFields.approverID = userId;
                updateFields.approvedByApproverAt = new Date();
            }
            else if (status === "reject") {
                // Approvers can reject:
                // - status 2 (Pending)
                // - status 1 (Their own previous approval - before admin acts)
                if (claim.status !== 2 && claim.status !== 1) {
                    return res.status(400).json({
                        message: "Approver can only reject pending or their own approved claims"
                    });
                }
                newStatus = 3; // Rejected by Approver
                updateFields.rejectedByApproverAt = new Date();
                updateFields.rejectedBy = userId;
            }
            else {
                return res.status(400).json({ message: "Invalid action" });
            }
        }
        else if (userRole === "Admin") {
            if (status === "approve") {
                // Admins can ONLY approve claims that Approver has already approved (status 1)
                if (claim.status !== 1) {
                    return res.status(400).json({
                        message: "Admin can only approve Level 1 approved claims"
                    });
                }
                newStatus = 5; // Approved (Final)
                updateFields.adminID = userId;
                updateFields.approvedByAdminAt = new Date();
            }
            else if (status === "reject") {
                // Admins can ONLY reject claims that Approver has approved (status 1)
                if (claim.status !== 1) {
                    return res.status(400).json({
                        message: "Admin can only reject Level 1 approved claims"
                    });
                }
                newStatus = 4; // Rejected by Admin
                updateFields.rejectedByAdminAt = new Date();
                updateFields.rejectedBy = userId;
            }
            else {
                return res.status(400).json({ message: "Invalid action" });
            }
        }
        else {
            return res.status(403).json({ message: "User role cannot approve/reject claims" });
        }
        updateFields.status = newStatus;
        const result = await db
            .collection("claims")
            .updateOne({ _id: new ObjectId(req.params.id) }, { $set: updateFields });
        res.status(200).json({
            message: `Claim ${status === "approve" ? "approved" : "rejected"} successfully`,
            oldStatus: claim.status,
            newStatus,
            modifiedCount: result.modifiedCount
        });
    }
    catch (error) {
        console.error("Error updating claim status:", error);
        res.status(500).json({ message: "Error updating claim status", error });
    }
});
export default router;
