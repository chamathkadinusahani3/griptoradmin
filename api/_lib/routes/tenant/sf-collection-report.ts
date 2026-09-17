import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { CollectionRecord, CollectionRecordDoc } from '../../models/CollectionRecord.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
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
  const { salespersonId } = req.query;
  await connectToDatabase();
  const clientId = session.clientId;

  const filter: Record<string, unknown> = { clientId, date: { $gte: from, $lte: to } };
  if (typeof salespersonId === 'string') filter.salespersonId = salespersonId;

  const collections = (await CollectionRecord.find(filter).sort({ date: -1 }).lean()) as CollectionRecordDoc[];
  const salespersonIds = [...new Set(collections.map((c) => c.salespersonId.toString()))];
  const customerIds = [...new Set(collections.map((c) => c.customerId.toString()))];

  const [salespersons, customers] = await Promise.all([
    Salesperson.find({ _id: { $in: salespersonIds }, clientId }).select('name code').lean() as Promise<SalespersonDoc[]>,
    Customer.find({ _id: { $in: customerIds }, clientId }).select('name').lean() as Promise<CustomerDoc[]>,
  ]);
  const spById = new Map(salespersons.map((s) => [s._id.toString(), s]));
  const custById = new Map(customers.map((c) => [c._id.toString(), c.name]));

  const rows = collections.map((c) => ({
    collectionId: c._id.toString(),
    salespersonName: spById.get(c.salespersonId.toString())?.name ?? 'Unknown',
    customerName: custById.get(c.customerId.toString()) ?? 'Unknown',
    date: c.date,
    amount: c.amount,
    method: c.method,
  }));

  const totalCollected = Math.round(rows.reduce((sum, r) => sum + r.amount, 0) * 100) / 100;
  const cashTotal = Math.round(rows.filter((r) => r.method === 'Cash').reduce((sum, r) => sum + r.amount, 0) * 100) / 100;
  const chequeTotal = Math.round(rows.filter((r) => r.method === 'Cheque').reduce((sum, r) => sum + r.amount, 0) * 100) / 100;

  return res.status(200).json({
    range: { from, to },
    summary: { totalCollected, cashTotal, chequeTotal, count: rows.length },
    rows,
  });
}
