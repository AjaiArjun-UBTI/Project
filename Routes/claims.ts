import express, { Request, Response } from "express";
import { db } from "../DB/Connection.js";
import { ObjectId, Binary } from "mongodb";

const router = express.Router();

/* ---------- HELPER: Get users under an approver ---------- */
async function getUsersUnderApprover(approverId: string): Promise<string[]> {
  const mapping = await db
    .collection("User_Approver_Map")
    .findOne({ ApproverID: approverId });
  
  return mapping?.UserID || [];
}

/* ---------- HELPER: Enrich claims with dimension data ---------- */
async function enrichClaimsWithDimensions(claims: any[]) {
  const statuses = await db.collection("Claim_Status").find({}).toArray();
  const types = await db.collection("Claim_Type").find({}).toArray();

  const statusMap = new Map<number, string>(
    statuses.map((s: any) => [s.R_NO, s.S_Desc])
  );
  const typeMapByRNO = new Map<number, string>(
    types.map((t: any) => [t.R_NO, t.T_Desc])
  );

  return claims.map((claim: any) => {
    const statusDesc: string = statusMap.get(claim.status) || "Unknown";
    const typeDesc: string = typeMapByRNO.get(claim.Type) || "Unknown";

    // Don't include the binary receipt data in list views (too heavy)
    const { Receipt, ...claimWithoutReceipt } = claim;

    return {
      ...claimWithoutReceipt,
      StatusDescription: statusDesc,
      TypeDescription: typeDesc,
      HasReceipt: !!Receipt, // Just indicate if receipt exists
    };
  });
}

/* ---------- GET MY CLAIMS (User's own claims) ---------- */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { userId, tenantId } = req.query;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const filter: any = { userID: userId.toString() };
    if (tenantId) filter.tenantID = tenantId.toString();

    const claims = await db.collection("claims").find(filter).toArray();
    const enrichedClaims = await enrichClaimsWithDimensions(claims);

    res.status(200).json(enrichedClaims);
  } catch (error) {
    console.error("Error fetching claims:", error);
    res.status(500).json({ message: "Error fetching claims", error });
  }
});

/* ---------- GET CLAIMS FOR APPROVAL (Approver/Admin) ---------- */
router.get("/for-approval", async (req: Request, res: Response) => {
  try {
    const { userId, role, tenantId } = req.query;

    if (!userId || !role) {
      return res.status(400).json({ message: "userId and role are required" });
    }

    let filter: any = {};
    
    if (tenantId) filter.tenantID = tenantId.toString();

    if (role === "Approver") {
      const userIds = await getUsersUnderApprover(userId.toString());
      filter.userID = { $in: userIds };
    } 
    else if (role === "Admin") {
      // Admin sees all claims
    }
    else {
      return res.status(403).json({ message: "Only Approvers and Admins can access this endpoint" });
    }

    const claims = await db.collection("claims").find(filter).toArray();
    const enrichedClaims = await enrichClaimsWithDimensions(claims);
    
    res.status(200).json(enrichedClaims);
  } catch (error) {
    console.error("Error fetching claims for approval:", error);
    res.status(500).json({ message: "Error fetching claims", error });
  }
});

/* ---------- GET ONE CLAIM (without receipt binary) ---------- */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid claim ID format" });
    }

    // Exclude the binary Receipt field from the response
    const claim = await db
      .collection("claims")
      .findOne(
        { _id: new ObjectId(req.params.id) },
        { projection: { Receipt: 0 } } // Exclude binary data
      );

    if (!claim) {
      return res.status(404).json({ message: "Claim not found" });
    }

    const enrichedClaim = await enrichClaimsWithDimensions([claim]);

    res.status(200).json(enrichedClaim[0]);
  } catch (error) {
    console.error("Error fetching claim:", error);
    res.status(500).json({ message: "Error fetching claim", error });
  }
});

/* ---------- CREATE CLAIM WITH RECEIPT ---------- */
router.post("/", async (req: Request, res: Response) => {
  try {
    console.log('=== CREATE CLAIM REQUEST ===');
    console.log('Title:', req.body.Title);
    console.log('Has Receipt:', !!req.body.Receipt);
    
    // Validate required fields
    if (!req.body.Title || !req.body.Description) {
      return res.status(400).json({ 
        message: "Title and description are required" 
      });
    }

    // Validate receipt is provided
    if (!req.body.Receipt) {
      return res.status(400).json({ 
        message: "Receipt is required" 
      });
    }

    // ✅ THIS IS THE KEY PART - Convert base64 to Binary
    let receiptBuffer: Buffer;
    try {
      receiptBuffer = Buffer.from(req.body.Receipt, 'base64');
      console.log('✅ Receipt buffer created, size:', receiptBuffer.length, 'bytes');
    } catch (err) {
      console.error('❌ Base64 decode error:', err);
      return res.status(400).json({ 
        message: "Invalid receipt data format" 
      });
    }
    
    // Validate file size (10MB limit)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (receiptBuffer.length > MAX_SIZE) {
      return res.status(400).json({ 
        message: "Receipt file size must be under 10MB" 
      });
    }

    const newClaim = {
      Title: req.body.Title,
      Description: req.body.Description,
      status: 2,
      tenantID: req.body.tenantID,
      userID: req.body.userID,
      Claim_Creation_Date: new Date(),
      Claim_Date: req.body.Claim_Date ? new Date(req.body.Claim_Date) : new Date(),
      Type: req.body.Type,
      Amount: req.body.Amount || 0,
      
      // ✅ STORE AS BINARY - This is what was missing!
      Receipt: new Binary(receiptBuffer),
      ReceiptMimeType: req.body.ReceiptMimeType,
      ReceiptFileName: req.body.ReceiptFileName,
      ReceiptSize: receiptBuffer.length,
      ReceiptUploadedAt: new Date(),
    };

    console.log('📤 Inserting claim with receipt size:', receiptBuffer.length);
    const result = await db.collection("claims").insertOne(newClaim);
    console.log('✅ Claim created:', result.insertedId);
    
    res.status(201).json({ 
      message: "Claim created successfully", 
      claimId: result.insertedId,
      claim: { ...newClaim, _id: result.insertedId }
    });
  } catch (error) {
    console.error("❌ Error creating claim:", error);
    res.status(500).json({ 
      message: "Error creating claim", 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/* ---------- GET RECEIPT ---------- */
router.get("/:id/receipt", async (req: Request, res: Response) => {
  try {
    console.log('=== GET RECEIPT REQUEST ===');
    console.log('Claim ID:', req.params.id);
    
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid claim ID format" });
    }

    const claim = await db
      .collection("claims")
      .findOne(
        { _id: new ObjectId(req.params.id) },
        { projection: { Receipt: 1, ReceiptMimeType: 1, ReceiptFileName: 1 } }
      );

    if (!claim) {
      console.error('❌ Claim not found');
      return res.status(404).json({ message: "Claim not found" });
    }

    if (!claim.Receipt) {
      console.error('❌ No receipt in claim');
      return res.status(404).json({ message: "No receipt found for this claim" });
    }

    console.log('✅ Receipt found, converting to base64...');
    
    // Convert Binary back to base64 for frontend
    const receiptBase64 = claim.Receipt.buffer.toString('base64');
    console.log('✅ Base64 length:', receiptBase64.length);

    res.status(200).json({
      receipt: receiptBase64,
      mimeType: claim.ReceiptMimeType,
      fileName: claim.ReceiptFileName
    });
  } catch (error) {
    console.error("❌ Error fetching receipt:", error);
    res.status(500).json({ message: "Error fetching receipt", error });
  }
});

/* ---------- DOWNLOAD RECEIPT (serve as file) ---------- */
router.get("/:id/receipt/download", async (req: Request, res: Response) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid claim ID format" });
    }

    const claim = await db
      .collection("claims")
      .findOne(
        { _id: new ObjectId(req.params.id) },
        { projection: { Receipt: 1, ReceiptMimeType: 1, ReceiptFileName: 1 } }
      );

    if (!claim || !claim.Receipt) {
      return res.status(404).json({ message: "Receipt not found" });
    }

    // Set headers to prompt download
    res.set({
      'Content-Type': claim.ReceiptMimeType,
      'Content-Disposition': `attachment; filename="${claim.ReceiptFileName}"`,
      'Content-Length': claim.Receipt.buffer.length
    });

    // Send the binary data directly
    res.send(claim.Receipt.buffer);
  } catch (error) {
    console.error("Error downloading receipt:", error);
    res.status(500).json({ message: "Error downloading receipt", error });
  }
});

/* ---------- UPDATE CLAIM ---------- */
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid claim ID format" });
    }

    const updates: any = { updatedAt: new Date() };
    
    if (req.body.Title !== undefined) updates.Title = req.body.Title;
    if (req.body.Description !== undefined) updates.Description = req.body.Description;
    if (req.body.Claim_Date !== undefined) updates.Claim_Date = new Date(req.body.Claim_Date);
    if (req.body.Type !== undefined) updates.Type = req.body.Type;
    if (req.body.Amount !== undefined) updates.Amount = req.body.Amount;

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
  } catch (error) {
    console.error("Error updating claim:", error);
    res.status(500).json({ message: "Error updating claim", error });
  }
});

/* ---------- DELETE CLAIM ---------- */
router.delete("/:id", async (req: Request, res: Response) => {
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
  } catch (error) {
    console.error("Error deleting claim:", error);
    res.status(500).json({ message: "Error deleting claim", error });
  }
});

/* ---------- APPROVE/REJECT CLAIM ---------- */
router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid claim ID format" });
    }

    const { status, userRole, userId } = req.body;

    const claim = await db.collection("claims").findOne({ _id: new ObjectId(req.params.id) });
    
    if (!claim) {
      return res.status(404).json({ message: "Claim not found" });
    }

    let newStatus: number;
    const updateFields: any = { updatedAt: new Date() };

    if (userRole === "Approver") {
      if (status === "approve") {
        if (claim.status !== 2 && claim.status !== 3 && claim.status !== 4) {
          return res.status(400).json({ 
            message: "Approver can only approve pending, self-rejected, or admin-rejected claims" 
          });
        }
        newStatus = 1;
        updateFields.approverID = userId;
        updateFields.approvedByApproverAt = new Date();
      } else if (status === "reject") {
        if (claim.status !== 2 && claim.status !== 1) {
          return res.status(400).json({ 
            message: "Approver can only reject pending or their own approved claims" 
          });
        }
        newStatus = 3;
        updateFields.rejectedByApproverAt = new Date();
        updateFields.rejectedBy = userId;
      } else {
        return res.status(400).json({ message: "Invalid action" });
      }
    } 
    else if (userRole === "Admin") {
      if (status === "approve") {
        if (claim.status !== 1) {
          return res.status(400).json({ 
            message: "Admin can only approve Level 1 approved claims" 
          });
        }
        newStatus = 5;
        updateFields.adminID = userId;
        updateFields.approvedByAdminAt = new Date();
      } else if (status === "reject") {
        if (claim.status !== 1) {
          return res.status(400).json({ 
            message: "Admin can only reject Level 1 approved claims" 
          });
        }
        newStatus = 4;
        updateFields.rejectedByAdminAt = new Date();
        updateFields.rejectedBy = userId;
      } else {
        return res.status(400).json({ message: "Invalid action" });
      }
    } 
    else {
      return res.status(403).json({ message: "User role cannot approve/reject claims" });
    }

    updateFields.status = newStatus;

    const result = await db
      .collection("claims")
      .updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: updateFields }
      );

    res.status(200).json({ 
      message: `Claim ${status === "approve" ? "approved" : "rejected"} successfully`,
      oldStatus: claim.status,
      newStatus,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error("Error updating claim status:", error);
    res.status(500).json({ message: "Error updating claim status", error });
  }
});

export default router;