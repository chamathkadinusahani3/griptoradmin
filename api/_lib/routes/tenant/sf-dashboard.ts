import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { SalesVisit, SalesVisitDoc, SALES_VISIT_STATUSES } from '../../models/SalesVisit.js';
import { SalesTarget, SalesTargetDoc } from '../../models/SalesTarget.js';
import { CollectionRecord, CollectionRecordDoc } from '../../models/CollectionRecord.js';
import { DeliveryAssignment } from '../../models/DeliveryAssignment.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';
import { computeActualSales } from '../../salesActuals.js';
import { computeVisitTripMetrics } from '../../tripCalc.js';
import { computePendingDeliveries } from '../../pendingDeliveries.js';

// Aggregates every SF-Phase 1-10 metric into one rollup — reads existing
// models, computes on request (same "derive, don't store" discipline as
// every other dashboard/report in this codebase), never a new source of
// truth. Gated by 'reports:view' like every other aggregate/report screen
// (Financial Overview, the 10 SF reports coming in Phase 12) rather than a
// new permission, per the roadmap's explicit "reports reuse reports:view"
// decision.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  await connectToDatabase();
  const clientId = session.clientId;
  const { from, to } = resolveReportRange(req);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [salespersons, visitsInRange, targetsInRange, collectionsToday, deliveredInRange, pendingDeliveries] = await Promise.all([
    Salesperson.find({ clientId }).select('status').lean() as Promise<SalespersonDoc[]>,
    SalesVisit.find({ clientId, visitDate: { $gte: from, $lte: to } }).lean() as Promise<SalesVisitDoc[]>,
    SalesTarget.find({ clientId, periodStart: { $lte: to }, periodEnd: { $gte: from } }).lean() as Promise<SalesTargetDoc[]>,
    CollectionRecord.find({ clientId, date: { $gte: todayStart, $lte: todayEnd } }).lean() as Promise<CollectionRecordDoc[]>,
    DeliveryAssignment.countDocuments({ clientId, status: 'Delivered', updatedAt: { $gte: from, $lte: to } }),
    computePendingDeliveries(clientId),
  ]);

  const salespersonStats = {
    total: salespersons.length,
    active: salespersons.filter((s) => s.status === 'Active').length,
    inactive: salespersons.filter((s) => s.status === 'Inactive').length,
  };

  const visitStats: Record<string, number> = { total: visitsInRange.length };
  for (const status of SALES_VISIT_STATUSES) visitStats[status] = visitsInRange.filter((v) => v.status === status).length;

  // Target/actual: each target's own periodStart/periodEnd is used for its
  // actual-sales window (not the dashboard's selected range) — same
  // per-target computation SalesTargets.tsx already shows individually,
  // just summed here into one rollup.
  const actualsByTarget = await Promise.all(
    targetsInRange.map((t) => computeActualSales(clientId, t.salespersonId.toString(), t.periodStart, t.periodEnd))
  );
  const totalTarget = targetsInRange.reduce((sum, t) => sum + t.targetAmount, 0);
  const totalActual = actualsByTarget.reduce((sum, a) => sum + a, 0);
  const achievementPct = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 10000) / 100 : null;

  const collectionsCash = collectionsToday.filter((c) => c.method === 'Cash').reduce((sum, c) => sum + c.amount, 0);
  const collectionsCheque = collectionsToday.filter((c) => c.method === 'Cheque').reduce((sum, c) => sum + c.amount, 0);
  const collectionsTotal = collectionsToday.reduce((sum, c) => sum + c.amount, 0);

  const totalDeliveryLoad = Math.round(pendingDeliveries.reduce((sum, d) => sum + d.totalVolume, 0) * 100) / 100;

  // Estimated trip cost: sum of the same per-visit fuel estimate SF-Phase 10
  // surfaces on Sales Visits, rolled up over the selected range.
  const tripMetrics = await computeVisitTripMetrics(clientId, visitsInRange);
  let estimatedTripCost = 0;
  let tripDistanceTotal = 0;
  let visitsWithFuelEstimate = 0;
  for (const metrics of tripMetrics.values()) {
    if (metrics.tripDistanceKm != null) tripDistanceTotal += metrics.tripDistanceKm;
    if (metrics.estimatedFuelCost != null) {
      estimatedTripCost += metrics.estimatedFuelCost;
      visitsWithFuelEstimate += 1;
    }
  }

  return res.status(200).json({
    range: { from, to },
    salespersons: salespersonStats,
    visits: visitStats,
    targets: {
      totalTarget,
      totalActual,
      achievementPct,
      targetCount: targetsInRange.length,
    },
    collections: {
      today: Math.round(collectionsTotal * 100) / 100,
      cash: Math.round(collectionsCash * 100) / 100,
      cheque: Math.round(collectionsCheque * 100) / 100,
    },
    deliveries: {
      pending: pendingDeliveries.length,
      completed: deliveredInRange,
      totalLoad: totalDeliveryLoad,
    },
    trips: {
      estimatedFuelCost: Math.round(estimatedTripCost * 100) / 100,
      totalDistanceKm: Math.round(tripDistanceTotal * 100) / 100,
      visitsWithFuelEstimate,
    },
  });
}
