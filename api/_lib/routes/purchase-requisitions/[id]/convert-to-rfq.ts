import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { PurchaseRequisition, PurchaseRequisitionDoc } from '../../../models/PurchaseRequisition.js';
import { RFQ } from '../../../models/RFQ.js';
import { Supplier } from '../../../models/Supplier.js';
import { requireTenantPermission } from '../../../auth.js';
import { generateSequentialNumber } from '../../../numbering.js';
import { serializeRFQ } from '../../../serializers.js';

interface ConvertBody {
  supplierIds?: string[];
  dueDate?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'purchase-orders:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing requisition id' });

  const { supplierIds, dueDate } = (req.body ?? {}) as ConvertBody;
  if (!supplierIds || supplierIds.length === 0) {
    return res.status(400).json({ error: 'At least one supplier is required' });
  }

  await connectToDatabase();

  const requisition = (await PurchaseRequisition.findOne({ _id: id, clientId: session.clientId }).lean()) as PurchaseRequisitionDoc | null;
  if (!requisition) return res.status(404).json({ error: 'Purchase requisition not found' });
  if (requisition.status !== 'Approved') {
    return res.status(400).json({ error: 'Only an Approved requisition can be sent out for quotes' });
  }

  const validSuppliers = await Supplier.countDocuments({ _id: { $in: supplierIds }, clientId: session.clientId });
  if (validSuppliers !== supplierIds.length) {
    return res.status(400).json({ error: 'One or more suppliers are unknown' });
  }

  const rfqNumber = await generateSequentialNumber(RFQ, session.clientId, 'rfqNumber', 'rfq');
  const rfq = await RFQ.create({
    clientId: session.clientId,
    rfqNumber,
    requisitionId: requisition._id,
    items: requisition.items.map((i) => ({ partId: i.partId, name: i.name, quantity: i.quantity })),
    supplierIds,
    dueDate: dueDate ? new Date(dueDate) : undefined,
  });

  await PurchaseRequisition.updateOne({ _id: id, clientId: session.clientId, status: 'Approved' }, { status: 'Converted' });

  const suppliers = await Supplier.find({ _id: { $in: supplierIds } }).select('name').lean();
  return res.status(201).json({ rfq: serializeRFQ(rfq.toObject(), suppliers.map((s) => s.name)) });
}
