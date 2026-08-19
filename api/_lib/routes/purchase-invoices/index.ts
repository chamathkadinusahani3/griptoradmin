import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { PurchaseInvoice, PurchaseInvoiceDoc } from '../../models/PurchaseInvoice.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../models/PurchaseOrder.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { requireTenantPermission } from '../../auth.js';
import { generateSequentialNumber } from '../../numbering.js';
import { effectiveReceivedQuantity } from '../../purchaseOrderReceiving.js';
import { serializePurchaseInvoice } from '../../serializers.js';

interface InvoiceLineInput {
  partId?: string;
  name?: string;
  quantity?: number;
  unitCost?: number;
}

interface CreatePurchaseInvoiceBody {
  purchaseOrderId?: string;
  supplierReference?: string;
  items?: InvoiceLineInput[];
  invoiceDate?: string;
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
  const { purchaseOrderId } = req.query;
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof purchaseOrderId === 'string') filter.purchaseOrderId = purchaseOrderId;

  const invoices = (await PurchaseInvoice.find(filter).sort({ createdAt: -1 }).lean()) as PurchaseInvoiceDoc[];
  const poIds = [...new Set(invoices.map((i) => i.purchaseOrderId.toString()))];
  const supplierIds = [...new Set(invoices.map((i) => i.supplierId.toString()))];
  const [orders, suppliers] = await Promise.all([
    PurchaseOrder.find({ _id: { $in: poIds } }).select('poNumber').lean() as Promise<PurchaseOrderDoc[]>,
    Supplier.find({ _id: { $in: supplierIds } }).select('name').lean() as Promise<SupplierDoc[]>,
  ]);
  const poNumberById = new Map(orders.map((o) => [o._id.toString(), o.poNumber]));
  const supplierNameById = new Map(suppliers.map((s) => [s._id.toString(), s.name]));

  return res.status(200).json({
    invoices: invoices.map((i) =>
      serializePurchaseInvoice(i, poNumberById.get(i.purchaseOrderId.toString()), supplierNameById.get(i.supplierId.toString()))
    ),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'purchase-orders:manage');
  if (!session) return;

  const { purchaseOrderId, supplierReference, items, invoiceDate, dueDate, notes } = (req.body ?? {}) as CreatePurchaseInvoiceBody;
  if (!purchaseOrderId || !items || items.length === 0 || !invoiceDate) {
    return res.status(400).json({ error: 'purchaseOrderId, at least one item, and an invoiceDate are required' });
  }
  for (const line of items) {
    if (!line.partId || !line.name || !line.quantity || line.quantity <= 0 || line.unitCost == null || line.unitCost < 0) {
      return res.status(400).json({ error: 'Each item requires a partId, name, positive quantity, and non-negative unitCost' });
    }
  }

  await connectToDatabase();

  const order = (await PurchaseOrder.findOne({ _id: purchaseOrderId, clientId: session.clientId }).lean()) as PurchaseOrderDoc | null;
  if (!order) return res.status(400).json({ error: 'Unknown purchase order' });
  if (order.status === 'Draft' || order.status === 'Cancelled') {
    return res.status(400).json({ error: 'Only an Ordered, Partially Received, or Received purchase order can be invoiced' });
  }
  const supplier = (await Supplier.findOne({ _id: order.supplierId, clientId: session.clientId }).lean()) as SupplierDoc | null;

  // Real 3-way match: what the supplier billed vs. what was actually
  // ordered (poLine.unitCost) and what actually arrived
  // (effectiveReceivedQuantity), not just a second copy of the PO.
  const poLineByPart = new Map(order.items.map((l) => [l.partId.toString(), l]));
  const discrepancyNotes: string[] = [];
  const lines = items.map((i) => ({ partId: i.partId!, name: i.name!, quantity: i.quantity!, unitCost: i.unitCost! }));

  for (const line of lines) {
    const poLine = poLineByPart.get(line.partId);
    if (!poLine) {
      discrepancyNotes.push(`"${line.name}" was not on the purchase order`);
      continue;
    }
    const received = effectiveReceivedQuantity(poLine, order.status);
    if (line.quantity > received) {
      discrepancyNotes.push(`"${line.name}": billed ${line.quantity}, but only ${received} was received`);
    }
    if (Math.abs(line.unitCost - poLine.unitCost) > 0.01) {
      discrepancyNotes.push(`"${line.name}": billed at ${line.unitCost}, ordered at ${poLine.unitCost}`);
    }
  }

  const subtotal = Math.round(lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0) * 100) / 100;

  const purchaseInvoiceNumber = await generateSequentialNumber(PurchaseInvoice, session.clientId, 'purchaseInvoiceNumber', 'purchaseInvoice');

  const invoice = await PurchaseInvoice.create({
    clientId: session.clientId,
    purchaseInvoiceNumber,
    purchaseOrderId,
    supplierId: order.supplierId,
    supplierReference,
    items: lines,
    subtotal,
    total: subtotal,
    invoiceDate: new Date(invoiceDate),
    dueDate: dueDate ? new Date(dueDate) : undefined,
    matchStatus: discrepancyNotes.length === 0 ? 'Matched' : 'Discrepancy',
    discrepancyNotes,
    notes,
  });

  return res.status(201).json({ invoice: serializePurchaseInvoice(invoice.toObject(), order.poNumber, supplier?.name) });
}
