import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SupplierQuotation, SupplierQuotationDoc } from '../../models/SupplierQuotation.js';
import { RFQ, RFQDoc } from '../../models/RFQ.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { requireTenantPermission } from '../../auth.js';
import { generateSequentialNumber } from '../../numbering.js';
import { serializeSupplierQuotation } from '../../serializers.js';

interface QuotationLineInput {
  partId?: string;
  name?: string;
  quantity?: number;
  unitCost?: number;
}

interface CreateSupplierQuotationBody {
  rfqId?: string;
  supplierId?: string;
  items?: QuotationLineInput[];
  validUntil?: string;
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
  const { rfqId } = req.query;
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof rfqId === 'string') filter.rfqId = rfqId;
  const quotations = (await SupplierQuotation.find(filter).sort({ createdAt: -1 }).lean()) as SupplierQuotationDoc[];
  const supplierIds = [...new Set(quotations.map((q) => q.supplierId.toString()))];
  const suppliers = (await Supplier.find({ _id: { $in: supplierIds } }).select('name').lean()) as SupplierDoc[];
  const nameById = new Map(suppliers.map((s) => [s._id.toString(), s.name]));

  return res.status(200).json({
    quotations: quotations.map((q) => serializeSupplierQuotation(q, nameById.get(q.supplierId.toString()))),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'purchase-orders:manage');
  if (!session) return;

  const { rfqId, supplierId, items, validUntil, notes } = (req.body ?? {}) as CreateSupplierQuotationBody;
  if (!rfqId || !supplierId || !items || items.length === 0) {
    return res.status(400).json({ error: 'rfqId, supplierId, and at least one item are required' });
  }
  for (const line of items) {
    if (!line.name || !line.quantity || line.quantity <= 0 || line.unitCost == null || line.unitCost < 0) {
      return res.status(400).json({ error: 'Each item requires a name, a positive quantity, and a non-negative unitCost' });
    }
  }

  await connectToDatabase();

  const rfq = (await RFQ.findOne({ _id: rfqId, clientId: session.clientId }).lean()) as RFQDoc | null;
  if (!rfq) return res.status(400).json({ error: 'Unknown RFQ' });
  if (rfq.status !== 'Open') return res.status(400).json({ error: 'This RFQ is no longer open' });
  if (!rfq.supplierIds.some((id) => id.toString() === supplierId)) {
    return res.status(400).json({ error: 'This supplier was not included on the RFQ' });
  }
  const supplier = (await Supplier.findOne({ _id: supplierId, clientId: session.clientId }).lean()) as SupplierDoc | null;
  if (!supplier) return res.status(400).json({ error: 'Unknown supplier' });

  const lines = items.map((i) => ({ partId: i.partId || undefined, name: i.name!, quantity: i.quantity!, unitCost: i.unitCost! }));
  const subtotal = Math.round(lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0) * 100) / 100;

  const quotationNumber = await generateSequentialNumber(SupplierQuotation, session.clientId, 'quotationNumber', 'supplierQuotation');

  const quotation = await SupplierQuotation.create({
    clientId: session.clientId,
    rfqId,
    supplierId,
    quotationNumber,
    items: lines,
    subtotal,
    total: subtotal,
    validUntil: validUntil ? new Date(validUntil) : undefined,
    notes,
  });

  return res.status(201).json({ quotation: serializeSupplierQuotation(quotation.toObject(), supplier.name) });
}
