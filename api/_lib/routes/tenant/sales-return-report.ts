import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Return, ReturnDoc } from '../../models/Return.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

// Sales Module Phase 13 — scoped to direction: 'customer' only. Return.ts
// also covers supplier-direction returns (goods going back to a supplier),
// which belong to a purchasing report, not this Sales Reporting Suite.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  const { from, to } = resolveReportRange(req);
  await connectToDatabase();

  const returns = (await Return.find({
    clientId: session.clientId,
    direction: 'customer',
    createdAt: { $gte: from, $lte: to },
  })
    .sort({ createdAt: -1 })
    .lean()) as ReturnDoc[];

  const totalAmount = round2(returns.reduce((sum, r) => sum + r.totalAmount, 0));
  const totalRefunded = round2(returns.reduce((sum, r) => sum + (r.refundStatus === 'Paid' ? r.refundAmount ?? 0 : 0), 0));

  const statusCounts = new Map<string, number>();
  for (const r of returns) statusCounts.set(r.status ?? 'Approved', (statusCounts.get(r.status ?? 'Approved') ?? 0) + 1);

  const byReason = new Map<string, { count: number; amount: number }>();
  for (const r of returns) {
    const agg = byReason.get(r.reason) ?? { count: 0, amount: 0 };
    agg.count += 1;
    agg.amount += r.totalAmount;
    byReason.set(r.reason, agg);
  }

  const rows = [...byReason.entries()]
    .map(([reason, v]) => ({ reason, count: v.count, amount: round2(v.amount) }))
    .sort((a, b) => b.amount - a.amount);

  return res.status(200).json({
    range: { from, to },
    summary: {
      totalReturns: returns.length,
      totalAmount,
      totalRefunded,
      avgReturnValue: returns.length > 0 ? round2(totalAmount / returns.length) : 0,
      statusBreakdown: Object.fromEntries(statusCounts),
    },
    rows,
  });
}
