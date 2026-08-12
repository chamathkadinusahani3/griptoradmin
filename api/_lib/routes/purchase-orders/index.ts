import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../models/PurchaseOrder.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { Part, PartDoc } from '../../models/Part.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveBranchFilter } from '../../branch.js';
import { generateSequentialNumber } from '../../numbering.js';
import { serializePurchaseOrder } from '../../serializers.js';

interface CreateLine {
  partId?: string;
  quantity?: number;
  unitCost?: number;
}

interface CreatePurchaseOrderBody {
  supplierId?: string;
  branchId?: string;
  items?: CreateLine[];
  expectedDate?: string;
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
  const { status, branchId } = req.query;
  const effectiveBranchId = resolveBranchFilter(session, typeof branchId === 'string' ? branchId : undefined);
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (effectiveBranchId) filter.branchId = effectiveBranchId;
  if (typeof status === 'string') filter.status = status;

  const orders = (await PurchaseOrder.find(filter).sort({ createdAt: -1 }).lean()) as PurchaseOrderDoc[];
  const supplierIds = [...new Set(orders.map((o) => o.supplierId.toString()))];
  const suppliers = (await Supplier.find({ _id: { $in: supplierIds } }).lean()) as SupplierDoc[];
  const supplierById = new Map(suppliers.map((s) => [s._id.toString(), s.name]));

  return res.status(200).json({
    purchaseOrders: orders.map((o) => serializePurchaseOrder(o, supplierById.get(o.supplierId.toString()))),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'purchase-orders:manage');
  if (!session) return;

  const { supplierId, branchId: requestedBranchId, items, expectedDate, notes } = (req.body ?? {}) as CreatePurchaseOrderBody;
  if (!supplierId || !items || items.length === 0) {
    return res.status(400).json({ error: 'supplierId and at least one item are required' });
  }
  for (const line of items) {
    if (!line.partId || !line.quantity || line.quantity <= 0 || line.unitCost == null || line.unitCost < 0) {
      return res.status(400).json({ error: 'Each item requires a partId, a positive quantity, and a non-negative unitCost' });
    }
  }

  await connectToDatabase();

  const supplier = (await Supplier.findOne({ _id: supplierId, clientId: session.clientId }).lean()) as SupplierDoc | null;
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

  const branchId = resolveBranchFilter(session, requestedBranchId);
  const partFilter: Record<string, unknown> = { _id: { $in: items.map((i) => i.partId) }, clientId: session.clientId };
  if (branchId) partFilter.branchId = branchId;
  const parts = (await Part.find(partFilter).lean()) as PartDoc[];
  const partById = new Map(parts.map((p) => [p._id.toString(), p]));

  const lines: { partId: string; name: string; quantity: number; unitCost: number }[] = [];
  let subtotal = 0;
  for (const line of items) {
    const part = partById.get(line.partId!);
    if (!part) return res.status(400).json({ error: `Unknown part for this branch: ${line.partId}` });
    lines.push({ partId: part._id.toString(), name: part.name, quantity: line.quantity!, unitCost: line.unitCost! });
    subtotal += line.quantity! * line.unitCost!;
  }
  subtotal = Math.round(subtotal * 100) / 100;

  const poNumber = await generateSequentialNumber(PurchaseOrder, session.clientId, 'poNumber', 'PO');
  const order = await PurchaseOrder.create({
    clientId: session.clientId,
    branchId: branchId || undefined,
    supplierId,
    poNumber,
    items: lines,
    subtotal,
    total: subtotal,
    balance: subtotal,
    status: 'Draft',
    expectedDate: expectedDate ? new Date(expectedDate) : undefined,
    notes,
  });

  return res.status(201).json({ purchaseOrder: serializePurchaseOrder(order.toObject(), supplier.name) });
}
