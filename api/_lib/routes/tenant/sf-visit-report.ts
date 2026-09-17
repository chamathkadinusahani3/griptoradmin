import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SalesVisit, SalesVisitDoc } from '../../models/SalesVisit.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';

// One row per visit scheduled within the range — purpose/status/duration
// focused. See sf-geo-visit-report.ts for the check-in/out + geo-tagging
// focused counterpart.
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

  const filter: Record<string, unknown> = { clientId, visitDate: { $gte: from, $lte: to } };
  if (typeof salespersonId === 'string') filter.salespersonId = salespersonId;

  const visits = (await SalesVisit.find(filter).sort({ visitDate: -1 }).lean()) as SalesVisitDoc[];
  const salespersonIds = [...new Set(visits.map((v) => v.salespersonId.toString()))];
  const customerIds = [...new Set(visits.map((v) => v.customerId.toString()))];

  const [salespersons, customers] = await Promise.all([
    Salesperson.find({ _id: { $in: salespersonIds }, clientId }).select('name code').lean() as Promise<SalespersonDoc[]>,
    Customer.find({ _id: { $in: customerIds }, clientId }).select('name').lean() as Promise<CustomerDoc[]>,
  ]);
  const spById = new Map(salespersons.map((s) => [s._id.toString(), s]));
  const custById = new Map(customers.map((c) => [c._id.toString(), c.name]));

  const rows = visits.map((v) => ({
    visitId: v._id.toString(),
    salespersonName: spById.get(v.salespersonId.toString())?.name ?? 'Unknown',
    customerName: custById.get(v.customerId.toString()) ?? 'Unknown',
    visitDate: v.visitDate,
    purpose: v.purpose,
    status: v.status,
    durationMinutes: v.durationMinutes,
  }));

  const completed = rows.filter((r) => r.status === 'Completed');
  const cancelled = rows.filter((r) => r.status === 'Cancelled').length;
  const withDuration = completed.filter((r) => r.durationMinutes != null);
  const avgDurationMinutes = withDuration.length > 0 ? Math.round(withDuration.reduce((sum, r) => sum + (r.durationMinutes ?? 0), 0) / withDuration.length) : null;

  return res.status(200).json({
    range: { from, to },
    summary: {
      total: rows.length,
      completed: completed.length,
      cancelled,
      completionRatePct: rows.length > 0 ? Math.round((completed.length / rows.length) * 100) : 0,
      avgDurationMinutes,
    },
    rows,
  });
}
