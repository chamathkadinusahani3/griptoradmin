import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { RFQ, RFQDoc } from '../../models/RFQ.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { requireTenantPermission } from '../../auth.js';
import { generateSequentialNumber } from '../../numbering.js';
import { serializeRFQ } from '../../serializers.js';

interface RFQLineInput {
  partId?: string;
  name?: string;
  quantity?: number;
}

interface CreateRFQBody {
  items?: RFQLineInput[];
  supplierIds?: string[];
  dueDate?: string;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'purchase-orders:view');
  if (!session) return;

  await connectToDatabase();
  const rfqs = (await RFQ.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as RFQDoc[];
  const supplierIds = [...new Set(rfqs.flatMap((r) => r.supplierIds.map((id) => id.toString())))];
  const suppliers = (await Supplier.find({ _id: { $in: supplierIds } }).select('name').lean()) as SupplierDoc[];
  const nameById = new Map(suppliers.map((s) => [s._id.toString(), s.name]));

  return res.status(200).json({
    rfqs: rfqs.map((r) => serializeRFQ(r, r.supplierIds.map((id) => nameById.get(id.toString()) ?? 'Unknown supplier'))),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'purchase-orders:manage');
  if (!session) return;

  const { items, supplierIds, dueDate, notes } = (req.body ?? {}) as CreateRFQBody;
  if (!items || items.length === 0) return res.status(400).json({ error: 'At least one item is required' });
  if (!supplierIds || supplierIds.length === 0) return res.status(400).json({ error: 'At least one supplier is required' });
  for (const line of items) {
    if (!line.name || !line.quantity || line.quantity <= 0) {
      return res.status(400).json({ error: 'Each item requires a name and a positive quantity' });
    }
  }

  await connectToDatabase();

  const suppliers = (await Supplier.find({ _id: { $in: supplierIds }, clientId: session.clientId }).select('name').lean()) as SupplierDoc[];
  if (suppliers.length !== supplierIds.length) return res.status(400).json({ error: 'One or more suppliers are unknown' });

  const rfqNumber = await generateSequentialNumber(RFQ, session.clientId, 'rfqNumber', 'rfq');
  const rfq = await RFQ.create({
    clientId: session.clientId,
    rfqNumber,
    items: items.map((i) => ({ partId: i.partId || undefined, name: i.name, quantity: i.quantity })),
    supplierIds,
    dueDate: dueDate ? new Date(dueDate) : undefined,
    notes,
  });

  return res.status(201).json({ rfq: serializeRFQ(rfq.toObject(), suppliers.map((s) => s.name)) });
}
