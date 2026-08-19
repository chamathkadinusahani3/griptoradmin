import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Feedback, FeedbackDoc } from '../../models/Feedback.js';
import { LoyaltyTransaction, LoyaltyTransactionDoc } from '../../models/LoyaltyTransaction.js';
import { Complaint, ComplaintDoc } from '../../models/Complaint.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  const { from, to } = resolveReportRange(req);
  await connectToDatabase();

  const [newCustomerDocs, allCustomers, feedback, loyaltyTx, complaints] = await Promise.all([
    Customer.find({ clientId: session.clientId, createdAt: { $gte: from, $lte: to } }).select('createdAt').lean() as Promise<CustomerDoc[]>,
    Customer.countDocuments({ clientId: session.clientId }),
    Feedback.find({ clientId: session.clientId, createdAt: { $gte: from, $lte: to } }).lean() as Promise<FeedbackDoc[]>,
    LoyaltyTransaction.find({ clientId: session.clientId, createdAt: { $gte: from, $lte: to } }).lean() as Promise<LoyaltyTransactionDoc[]>,
    Complaint.find({ clientId: session.clientId, direction: 'customer', createdAt: { $gte: from, $lte: to } }).lean() as Promise<ComplaintDoc[]>,
  ]);
  const newCustomers = newCustomerDocs.length;

  const ratingCounts = [0, 0, 0, 0, 0]; // index 0 = 1-star ... index 4 = 5-star
  let ratingSum = 0;
  for (const f of feedback) {
    ratingSum += f.rating;
    if (f.rating >= 1 && f.rating <= 5) ratingCounts[f.rating - 1] += 1;
  }
  const avgRating = feedback.length ? Math.round((ratingSum / feedback.length) * 10) / 10 : null;

  let pointsEarned = 0;
  let pointsRedeemed = 0;
  for (const tx of loyaltyTx) {
    if (tx.points > 0) pointsEarned += tx.points;
    else pointsRedeemed += Math.abs(tx.points);
  }

  const complaintsByStatus = { Open: 0, 'In Progress': 0, Resolved: 0, Closed: 0 };
  for (const c of complaints) {
    if (c.status in complaintsByStatus) complaintsByStatus[c.status as keyof typeof complaintsByStatus] += 1;
  }

  const dailyNewCustomers = new Map<string, number>();
  for (const c of newCustomerDocs) {
    const day = (c as unknown as { createdAt: Date }).createdAt.toISOString().slice(0, 10);
    dailyNewCustomers.set(day, (dailyNewCustomers.get(day) ?? 0) + 1);
  }

  return res.status(200).json({
    range: { from, to },
    newCustomers,
    totalCustomers: allCustomers,
    avgRating,
    feedbackCount: feedback.length,
    ratingDistribution: ratingCounts.map((count, i) => ({ stars: i + 1, count })),
    pointsEarned,
    pointsRedeemed,
    complaintsTotal: complaints.length,
    complaintsByStatus,
    dailyNewCustomers: Array.from(dailyNewCustomers.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
  });
}
