import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Inspection, InspectionDoc } from '../../models/Inspection.js';
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

  const inspections = (await Inspection.find({ clientId: session.clientId, createdAt: { $gte: from, $lte: to } }).lean()) as InspectionDoc[];

  const byResult = { Pass: 0, Advisory: 0, Fail: 0 };
  const byApproval = { not_required: 0, pending: 0, approved: 0, rejected: 0 };
  const dailyVolume = new Map<string, number>();
  let approvedAdditionalCost = 0;

  for (const insp of inspections) {
    byResult[insp.result] += 1;
    byApproval[insp.approvalStatus as keyof typeof byApproval] += 1;
    if (insp.approvalStatus === 'approved' && insp.additionalCost) approvedAdditionalCost += insp.additionalCost;

    const day = (insp as unknown as { createdAt: Date }).createdAt.toISOString().slice(0, 10);
    dailyVolume.set(day, (dailyVolume.get(day) ?? 0) + 1);
  }

  const total = inspections.length;
  const requiringApproval = byApproval.pending + byApproval.approved + byApproval.rejected;

  return res.status(200).json({
    range: { from, to },
    total,
    passRate: total ? Math.round((byResult.Pass / total) * 100) : 0,
    approvalRate: requiringApproval ? Math.round((byApproval.approved / requiringApproval) * 100) : null,
    approvedAdditionalCost: Math.round(approvedAdditionalCost * 100) / 100,
    byResult,
    byApproval,
    dailyVolume: Array.from(dailyVolume.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
  });
}
