import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { SalesVisit, SalesVisitDoc } from '../../models/SalesVisit.js';
import { CollectionRecord, CollectionRecordDoc } from '../../models/CollectionRecord.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';

// Activity-focused per-salesperson rollup (visits + collections only — no
// sales figures, see sf-salesperson-report.ts for that). Deliveries are
// deliberately excluded: DeliveryAssignment.driverId references Employee,
// not Salesperson, so there is no real attribution link to report here
// without fabricating one.
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

  const [visits, collections] = await Promise.all([
    SalesVisit.find({ clientId, salespersonId: { $in: spIds }, visitDate: { $gte: from, $lte: to } }).lean() as Promise<SalesVisitDoc[]>,
    CollectionRecord.find({ clientId, salespersonId: { $in: spIds }, date: { $gte: from, $lte: to } }).lean() as Promise<CollectionRecordDoc[]>,
  ]);

  const rows = salespersons.map((sp) => {
    const id = sp._id.toString();
    const spVisits = visits.filter((v) => v.salespersonId.toString() === id);
    const spCollections = collections.filter((c) => c.salespersonId.toString() === id);
    return {
      salespersonId: id,
      name: sp.name,
      code: sp.code,
      visitsScheduled: spVisits.length,
      visitsCompleted: spVisits.filter((v) => v.status === 'Completed').length,
      visitsCancelled: spVisits.filter((v) => v.status === 'Cancelled').length,
      collectionsCount: spCollections.length,
      collectionsAmount: Math.round(spCollections.reduce((sum, c) => sum + c.amount, 0) * 100) / 100,
    };
  });

  const mostActive = rows.slice().sort((a, b) => b.visitsCompleted + b.collectionsCount - (a.visitsCompleted + a.collectionsCount))[0] ?? null;

  return res.status(200).json({
    range: { from, to },
    summary: {
      totalVisits: rows.reduce((sum, r) => sum + r.visitsScheduled, 0),
      totalCollections: rows.reduce((sum, r) => sum + r.collectionsCount, 0),
      mostActiveSalespersonName: mostActive && mostActive.visitsCompleted + mostActive.collectionsCount > 0 ? mostActive.name : null,
    },
    rows: rows.sort((a, b) => b.visitsCompleted + b.collectionsCount - (a.visitsCompleted + a.collectionsCount)),
  });
}
