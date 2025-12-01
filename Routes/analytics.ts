import express, { Request, Response } from "express";
import { db } from "../DB/Connection.js";

const router = express.Router();

// Define interfaces for type safety
interface ClaimDocument {
  _id: any;
  Title: string;
  Amount: number;
  status: number;
  Type: number;
  Claim_Creation_Date: Date | string;
  userID: string;
  tenantID?: string;
  Claim_Date: Date ;
}

interface ClaimType {
  R_NO: number;
  T_Desc: string;
}

/* ---------- GET USER ANALYTICS ---------- */
router.get("/user/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { tenantId } = req.query;

    console.log('=== ANALYTICS REQUEST ===');
    console.log('User ID:', userId);
    console.log('Tenant ID:', tenantId);

    const filter: any = { userID: userId };
    if (tenantId) filter.tenantID = tenantId.toString();

    // Fetch all claims for this user
    const claims = await db.collection("claims").find(filter).toArray() as ClaimDocument[];
    
    console.log('Total claims found:', claims.length);

    // Fetch dimension data
    const types = await db.collection("Claim_Type").find({}).toArray() as ClaimType[];
    const typeMap = new Map<number, string>(
      types.map((t) => [t.R_NO, t.T_Desc])
    );

    // Calculate summary statistics
    const totalSubmitted = claims.reduce((sum, c) => sum + (c.Amount || 0), 0); // ✅ Sum of all amounts
    const totalClaims = claims.length; // ✅ Total count of all claims
    
    const approvedClaims = claims.filter(c => c.status === 5);
    const totalApprovedCount = approvedClaims.length; // ✅ COUNT of approved claims
    const totalApprovedAmount = approvedClaims.reduce((sum, c) => sum + (c.Amount || 0), 0); // Amount paid out
    
    const pendingClaims = claims.filter(c => [1, 2].includes(c.status));
    const pendingCount = pendingClaims.length; // ✅ COUNT of pending claims
    
    const rejectedCount = claims.filter(c => [3, 4].includes(c.status)).length; // ✅ COUNT of rejected claims

    // Monthly trend data (last 12 months)
    const monthlyTrend = getMonthlyTrend(claims);

    // Weekly claims count (last 7 days)
    const weeklyClaims = getWeeklyClaims(claims);

    // Claims by type/category
    const claimsByType = getClaimsByType(claims, typeMap);

    // Status breakdown
    const statusBreakdown = {
      pending: claims.filter(c => c.status === 2).length,
      approverApproved: claims.filter(c => c.status === 1).length,
      fullyApproved: claims.filter(c => c.status === 5).length,
      rejected: claims.filter(c => [3, 4].includes(c.status)).length,
    };

    // Recent pending claims (last 5)
    const recentPending = pendingClaims
      .sort((a, b) => new Date(b.Claim_Creation_Date).getTime() - new Date(a.Claim_Creation_Date).getTime())
      .slice(0, 5)
      .map(c => ({
        id: c._id.toString(),
        title: c.Title,
        amount: c.Amount,
        date: c.Claim_Creation_Date,
        status: c.status,
        type: typeMap.get(c.Type) || 'Unknown'
      }));

    // Daily activity in current month (based on Claim_Date)
    const dailyActivity = getDailyActivityInMonth(claims);

    const analytics = {
      summary: {
        totalSubmitted, // Sum of all claim amounts
        totalClaims, // Total number of claims submitted
        totalApprovedCount, // COUNT of approved claims (not amount)
        totalApprovedAmount, // Amount of money approved (optional, for display)
        pendingCount, // COUNT of pending claims
        rejectedCount, // COUNT of rejected claims
        approvalRate: totalClaims > 0 ? Math.round((approvedClaims.length / totalClaims) * 100) : 0 // % of claims approved
      },
      monthlyTrend,
      weeklyClaims,
      dailyActivity, // NEW: Day of month activity
      claimsByType,
      statusBreakdown,
      recentPending
    };

    console.log('Analytics summary:', analytics.summary);

    res.status(200).json(analytics);
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ 
      message: "Error fetching analytics", 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/* ---------- HELPER: Get monthly trend data ---------- */
function getMonthlyTrend(claims: ClaimDocument[]) {
  const monthsAgo = 12;
  const now = new Date();
  const trend: Array<{
    date: string;
    pending: number;
    approved: number;
    fullyApproved: number;
    total: number;
  }> = [];

  for (let i = monthsAgo - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    const monthClaims = claims.filter(c => {
      const claimDate = new Date(c.Claim_Creation_Date);
      return claimDate >= monthStart && claimDate <= monthEnd;
    });

    const pending = monthClaims.filter(c => c.status === 2).reduce((sum, c) => sum + c.Amount, 0);
    const approved = monthClaims.filter(c => c.status === 1).reduce((sum, c) => sum + c.Amount, 0);
    const fullyApproved = monthClaims.filter(c => c.status === 5).reduce((sum, c) => sum + c.Amount, 0);

    trend.push({
      date: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      pending,
      approved,
      fullyApproved,
      total: pending + approved + fullyApproved
    });
  }

  return trend;
}

/* ---------- HELPER: Get weekly claims count ---------- */
function getWeeklyClaims(claims: ClaimDocument[]) {
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6);

  const weeklyCounts: Array<{
    day: string;
    claims: number;
    fullDate: string;
  }> = [];

  for (let i = 0; i < 7; i++) {
    const date = new Date(weekAgo);
    date.setDate(weekAgo.getDate() + i);
    
    const dayStart = new Date(date.setHours(0, 0, 0, 0));
    const dayEnd = new Date(date.setHours(23, 59, 59, 999));

    const count = claims.filter(c => {
      const claimDate = new Date(c.Claim_Creation_Date);
      return claimDate >= dayStart && claimDate <= dayEnd;
    }).length;

    weeklyCounts.push({
      day: daysOfWeek[date.getDay()],
      claims: count,
      fullDate: date.toISOString().split('T')[0]
    });
  }

  return weeklyCounts;
}

/* ---------- HELPER: Get claims grouped by type ---------- */
function getClaimsByType(claims: ClaimDocument[], typeMap: Map<number, string>) {
  const typeGroups: { [key: string]: { count: number; amount: number } } = {};

  claims.forEach(c => {
    const typeName = typeMap.get(c.Type) || 'Unknown';
    if (!typeGroups[typeName]) {
      typeGroups[typeName] = { count: 0, amount: 0 };
    }
    typeGroups[typeName].count++;
    typeGroups[typeName].amount += c.Amount || 0;
  });

  const total = claims.reduce((sum, c) => sum + (c.Amount || 0), 0);

  return Object.entries(typeGroups).map(([name, data]) => ({
    name,
    count: data.count,
    amount: data.amount,
    percentage: total > 0 ? Math.round((data.amount / total) * 100) : 0
  })).sort((a, b) => b.amount - a.amount);
}

/* ---------- HELPER: Get daily activity in current month ---------- */
function getDailyActivityInMonth(claims: ClaimDocument[]) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const dailyData: Array<{
    day: number;
    count: number;
    amount: number;
  }> = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStart = new Date(currentYear, currentMonth, day, 0, 0, 0);
    const dayEnd = new Date(currentYear, currentMonth, day, 23, 59, 59);

    const dayClaims = claims.filter(c => {
      const claimDate = new Date(c.Claim_Date);
      return claimDate >= dayStart && claimDate <= dayEnd;
    });

    dailyData.push({
      day,
      count: dayClaims.length,
      amount: dayClaims.reduce((sum, c) => sum + (c.Amount || 0), 0)
    });
  }

  return dailyData;
}

export default router;