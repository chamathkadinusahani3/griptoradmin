import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { RFQ, RFQDoc } from '../../models/RFQ.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeRFQ } from '../../serializers.js';

interface UpdateRFQBody {
  action?: 'close';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'purchase-orders:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing RFQ id' });

  const { action } = (req.body ?? {}) as UpdateRFQBody;
  if (action !== 'close') return res.status(400).json({ error: 'action must be "close"' });

  await connectToDatabase();

  const rfq = (await RFQ.findOneAndUpdate(
    { _id: id, clientId: session.clientId, status: 'Open' },
    { status: 'Closed' },
    { returnDocument: 'after' }
  ).lean()) as RFQDoc | null;
  if (!rfq) return res.status(400).json({ error: 'This RFQ is not open' });

  const suppliers = (await Supplier.find({ _id: { $in: rfq.supplierIds } }).select('name').lean()) as SupplierDoc[];
  return res.status(200).json({ rfq: serializeRFQ(rfq, suppliers.map((s) => s.name)) });
}
