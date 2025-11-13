import express, { Request, Response } from "express";
import { db } from "../DB/Connection";
import { ObjectId } from "mongodb";

const router = express.Router();

/* ---------- GET ALL CLAIMS ---------- */
router.get("/", async (req: Request, res: Response) => {
  try {
    const claims = await db.collection("claims").find({}).toArray();
    res.status(200).json(claims);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching claims", error });
  }
});

/* ---------- GET ONE CLAIM ---------- */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const claim = await db
      .collection("claims")
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!claim) {
      return res.status(404).json({ message: "Claim not found" });
    }

    res.status(200).json(claim);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching claim", error });
  }
});

/* ---------- CREATE CLAIM ---------- */
router.post("/", async (req: Request, res: Response) => {
  try {
    const newClaim = {
      title: req.body.title,
      description: req.body.description,
      status: 2,
      tenantId: req.body.tenantId,
      userId: req.body.userId,
      claimcreatedAt: new Date(),
      claimDate: req.body.claimDate || new Date(),
      category: req.body.category,
    };

    const result = await db.collection("claims").insertOne(newClaim);
    res.status(201).json({ message: "Claim created", claimId: result.insertedId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error creating claim", error });
  }
});

/* ---------- UPDATE CLAIM ---------- */
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const objectId = new ObjectId(req.params.id);           // ← ONE ObjectId
    const updates = {
      $set: {
        title: req.body.title,
        description: req.body.description,
        status: req.body.status,
        claimDate: req.body.claimDate,
        category: req.body.category,
        claimcreatedAt: req.body.claimcreatedAt,
        tenantId: req.body.tenantId,
        userId: req.body.userId,
      },
    };

    const result = await db
      .collection("claims")
      .updateOne({ _id: objectId }, updates);               // ← PASS objectId directly

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Claim not found" });
    }

    res.status(200).json({ message: "Claim updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating claim", error });
  }
});

/* ---------- DELETE CLAIM ---------- */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const result = await db
      .collection("claims")
      .deleteOne({ _id: new ObjectId(req.params.id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Claim not found" });
    }

    res.status(200).json({ message: "Claim deleted", deletedCount: result.deletedCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error deleting claim", error });
  }
});

export default router;