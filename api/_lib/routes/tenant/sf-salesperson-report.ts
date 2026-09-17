import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { SalesTarget, SalesTargetDoc } from '../../models/SalesTarget.js';
import { SalesVisit, SalesVisitDoc } from '../../models/SalesVisit.js';
import { CollectionRecord, CollectionRecordDoc } from '../../models/CollectionRecord.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';
import { computeActualSales } from '../../salesActuals.js';

// Sales-focused per-salesperson rollup — actual sales attributed in the
// range (SF-Phase 6), vs. the sum of targets whose period overlaps the
// range (SF-Phase 6), plus visit/collection activity for context. Distinct
// from sf-activity-report.ts (visits/collections in depth, no sales figures)
// and the SF Dashboard (tenant-wide totals, no per-salesperson breakdown).
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

  const salespersons = (await Salesperson.find({ clientId }).lean()) as SalespersonDoc[];
  const spIds = salespersons.map((s) => s._id.toString());

  const [targets, visits, collections] = await Promise.all([
    SalesTarget.find({ clientId, salespersonId: { $in: spIds }, periodStart: { $lte: to }, periodEnd: { $gte: from } }).lean() as Promise<SalesTargetDoc[]>,
    SalesVisit.find({ clientId, salespersonId: { $in: spIds }, visitDate: { $gte: from, $lte: to } }).lean() as Promise<SalesVisitDoc[]>,
    CollectionRecord.find({ clientId, salespersonId: { $in: spIds }, date: { $gte: from, $lte: to } }).lean() as Promise<CollectionRecordDoc[]>,
  ]);

  const actualSalesById = new Map(await Promise.all(spIds.map(async (id) => [id, await computeActualSales(clientId, id, from, to)] as const)));

  const rows = salespersons.map((sp) => {
    const id = sp._id.toString();
    const targetAmount = targets.filter((t) => t.salespersonId.toString() === id).reduce((sum, t) => sum + t.targetAmount, 0);
    const actualSales = Math.round((actualSalesById.get(id) ?? 0) * 100) / 100;
    const visitsCompleted = visits.filter((v) => v.salespersonId.toString() === id && v.status === 'Completed').length;
    const collectionsTotal = Math.round(collections.filter((c) => c.salespersonId.toString() === id).reduce((sum, c) => sum + c.amount, 0) * 100) / 100;
    // Sales Module Phase 9 — revenue-based commission, derived here rather
    // than stored anywhere: commissionAmount is just actualSales × the
    // salesperson's own commissionPct, recomputed fresh every time this
    // report runs. 0 commissionPct (the default) means 0 commission, zero
    // behavior change for a salesperson nobody has configured one for.
    const commissionPct = sp.commissionPct ?? 0;
    const commissionAmount = Math.round(actualSales * (commissionPct / 100) * 100) / 100;
    return {
      salespersonId: id,
      code: sp.code,
      name: sp.name,
      territory: sp.territory,
      status: sp.status,
      actualSales,
      targetAmount,
      achievementPct: targetAmount > 0 ? Math.round((actualSales / targetAmount) * 10000) / 100 : null,
      visitsCompleted,
      collectionsTotal,
      commissionPct,
      commissionAmount,
    };
  });

  const totalActualSales = Math.round(rows.reduce((sum, r) => sum + r.actualSales, 0) * 100) / 100;
  const totalTargetAmount = rows.reduce((sum, r) => sum + r.targetAmount, 0);
  const totalCommissionAmount = Math.round(rows.reduce((sum, r) => sum + r.commissionAmount, 0) * 100) / 100;
  const topPerformer = rows.slice().sort((a, b) => b.actualSales - a.actualSales)[0] ?? null;

  return res.status(200).json({
    range: { from, to },
    summary: {
      totalActualSales,
      totalTargetAmount,
      overallAchievementPct: totalTargetAmount > 0 ? Math.round((totalActualSales / totalTargetAmount) * 10000) / 100 : null,
      topPerformerName: topPerformer && topPerformer.actualSales > 0 ? topPerformer.name : null,
      totalCommissionAmount,
    },
    rows: rows.sort((a, b) => b.actualSales - a.actualSales),
  });
}
