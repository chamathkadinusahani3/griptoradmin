import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SalesVisit, SalesVisitDoc } from '../../models/SalesVisit.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';
import { computeVisitTripMetrics } from '../../tripCalc.js';

// One row per checked-in visit in the range — attendance (when did they
// actually arrive/leave) and geo-tagging coverage (was a coordinate
// captured at all), plus the SF-Phase 10 trip distance for that check-in.
// See sf-visit-report.ts for the purpose/status-focused counterpart.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  const { from, to } = resolveReportRange(req);
  const { salespersonId } = req.query;
  await connectToDatabase();
  const clientId = session.clientId;

  const filter: Record<string, unknown> = { clientId, visitDate: { $gte: from, $lte: to }, checkInAt: { $ne: null } };
  if (typeof salespersonId === 'string') filter.salespersonId = salespersonId;

  const visits = (await SalesVisit.find(filter).sort({ checkInAt: -1 }).lean()) as SalesVisitDoc[];
  const salespersonIds = [...new Set(visits.map((v) => v.salespersonId.toString()))];
  const customerIds = [...new Set(visits.map((v) => v.customerId.toString()))];

  const [salespersons, customers, tripMetrics] = await Promise.all([
    Salesperson.find({ _id: { $in: salespersonIds }, clientId }).select('name code').lean() as Promise<SalespersonDoc[]>,
    Customer.find({ _id: { $in: customerIds }, clientId }).select('name').lean() as Promise<CustomerDoc[]>,
    computeVisitTripMetrics(clientId, visits),
  ]);
  const spById = new Map(salespersons.map((s) => [s._id.toString(), s]));
  const custById = new Map(customers.map((c) => [c._id.toString(), c.name]));

  const rows = visits.map((v) => {
    const geoTagged = v.checkInLat != null && v.checkInLng != null;
    const metrics = tripMetrics.get(v._id.toString());
    return {
      visitId: v._id.toString(),
      salespersonName: spById.get(v.salespersonId.toString())?.name ?? 'Unknown',
      customerName: custById.get(v.customerId.toString()) ?? 'Unknown',
      checkInAt: v.checkInAt,
      checkOutAt: v.checkOutAt,
      geoTagged,
      tripDistanceKm: metrics?.tripDistanceKm ?? null,
    };
  });

  const geoTaggedCount = rows.filter((r) => r.geoTagged).length;
  const distances = rows.map((r) => r.tripDistanceKm).filter((d): d is number => d != null);
  const avgTripDistanceKm = distances.length > 0 ? Math.round((distances.reduce((sum, d) => sum + d, 0) / distances.length) * 100) / 100 : null;

  return res.status(200).json({
    range: { from, to },
    summary: {
      checkedInCount: rows.length,
      geoTaggedCount,
      geoTaggedPct: rows.length > 0 ? Math.round((geoTaggedCount / rows.length) * 100) : 0,
      avgTripDistanceKm,
    },
    rows,
  });
}
