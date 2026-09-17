import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SalesTarget, SalesTargetDoc } from '../../models/SalesTarget.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';
import { computeActualSales } from '../../salesActuals.js';

// One row per individual SalesTarget (not aggregated per salesperson —
// see sf-salesperson-report.ts for that view). Each target's own
// periodStart/periodEnd is used for its actual-sales window, same
// convention as SalesTargets.tsx and the SF Dashboard rollup.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  const { from, to } = resolveReportRange(req);
  await connectToDatabase();
  const clientId = session.clientId;

  const targets = (await SalesTarget.find({ clientId, periodStart: { $lte: to }, periodEnd: { $gte: from } })
    .sort({ periodStart: -1 })
    .lean()) as SalesTargetDoc[];

  const salespersons = (await Salesperson.find({ clientId }).select('name code').lean()) as SalespersonDoc[];
  const spById = new Map(salespersons.map((s) => [s._id.toString(), s]));

  const rows = await Promise.all(
    targets.map(async (t) => {
      const actualAmount = Math.round((await computeActualSales(clientId, t.salespersonId.toString(), t.periodStart, t.periodEnd)) * 100) / 100;
      const sp = spById.get(t.salespersonId.toString());
      return {
        targetId: t._id.toString(),
        salespersonName: sp?.name ?? 'Unknown',
        salespersonCode: sp?.code,
        periodType: t.periodType,
        periodStart: t.periodStart,
        periodEnd: t.periodEnd,
        targetAmount: t.targetAmount,
        actualAmount,
        achievementPct: t.targetAmount > 0 ? Math.round((actualAmount / t.targetAmount) * 10000) / 100 : null,
      };
    })
  );

  const totalTarget = rows.reduce((sum, r) => sum + r.targetAmount, 0);
  const totalActual = Math.round(rows.reduce((sum, r) => sum + r.actualAmount, 0) * 100) / 100;
  const metCount = rows.filter((r) => r.achievementPct != null && r.achievementPct >= 100).length;

  return res.status(200).json({
    range: { from, to },
    summary: {
      targetCount: rows.length,
      totalTarget,
      totalActual,
      overallAchievementPct: totalTarget > 0 ? Math.round((totalActual / totalTarget) * 10000) / 100 : null,
      metCount,
    },
    rows,
  });
}
