import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../db.js';
import { Return, ReturnDoc } from '../../models/Return.js';
import { Sale, SaleDoc } from '../../models/Sale.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../models/PurchaseOrder.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { Part } from '../../models/Part.js';
import { requireTenantPermission } from '../../auth.js';
import { generateSequentialNumber } from '../../numbering.js';
import { serializeReturn } from '../../serializers.js';

interface ReturnLineBody {
  partId?: string;
  quantity?: number;
}

interface CreateReturnBody {
  direction?: 'customer' | 'supplier';
  sourceId?: string;
  items?: ReturnLineBody[];
  reason?: string;
  notes?: string;
  refundAmount?: number;
  refundMethod?: 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Other';
  chequeNumber?: string;
  bankAccountId?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'returns:view');
  if (!session) return;

  await connectToDatabase();
  const returns = (await Return.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as ReturnDoc[];

  const supplierSourceIds = returns.filter((r) => r.sourceType === 'purchase-order').map((r) => r.sourceId);
  const orders = supplierSourceIds.length
    ? ((await PurchaseOrder.find({ _id: { $in: supplierSourceIds } }).lean()) as PurchaseOrderDoc[])
    : [];
  const supplierIdByOrderId = new Map(orders.map((o) => [o._id.toString(), o.supplierId.toString()]));
  const supplierIds = [...new Set([...supplierIdByOrderId.values()])];
  const suppliers = supplierIds.length ? ((await Supplier.find({ _id: { $in: supplierIds } }).lean()) as SupplierDoc[]) : [];
  const supplierNameById = new Map(suppliers.map((s) => [s._id.toString(), s.name]));
  const poNumberById = new Map(orders.map((o) => [o._id.toString(), o.poNumber]));

  return res.status(200).json({
    returns: returns.map((r) => {
      const party =
        r.sourceType === 'purchase-order' ? supplierNameById.get(supplierIdByOrderId.get(r.sourceId.toString()) ?? '') : undefined;
      const reference = r.sourceType === 'purchase-order' ? poNumberById.get(r.sourceId.toString()) : undefined;
      return serializeReturn(r, party, reference);
    }),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'returns:manage');
  if (!session) return;

  const body = (req.body ?? {}) as CreateReturnBody;
  const { direction, sourceId, items, reason, notes, refundAmount, refundMethod, chequeNumber, bankAccountId } = body;

  if (!direction || (direction !== 'customer' && direction !== 'supplier')) {
    return res.status(400).json({ error: 'direction must be customer or supplier' });
  }
  if (!sourceId || !items || items.length === 0) {
    return res.status(400).json({ error: 'sourceId and at least one item are required' });
  }
  if (!reason?.trim()) {
    return res.status(400).json({ error: 'A reason is required' });
  }
  for (const line of items) {
    if (!line.partId || !line.quantity || line.quantity <= 0) {
      return res.status(400).json({ error: 'Each item requires a partId and a positive quantity' });
    }
  }
  if (refundAmount && refundAmount > 0) {
    if (!refundMethod) return res.status(400).json({ error: 'refundMethod is required when refundAmount is set' });
    if (refundMethod === 'Cheque' && !chequeNumber?.trim()) {
      return res.status(400).json({ error: 'A cheque number is required for cheque refunds' });
    }
  }

  await connectToDatabase();

  const sourceType = direction === 'customer' ? 'sale' : 'purchase-order';

  // Cumulative check — a source document's own line quantity is the cap
  // across ALL returns ever made against it, not just this one, so the
  // same item can't be returned twice past what was actually bought/received.
  const priorReturns = (await Return.find({ clientId: session.clientId, sourceId, sourceType }).lean()) as ReturnDoc[];
  const priorReturnedByPart = new Map<string, number>();
  for (const r of priorReturns) {
    for (const line of r.items) {
      const key = line.partId.toString();
      priorReturnedByPart.set(key, (priorReturnedByPart.get(key) ?? 0) + line.quantity);
    }
  }

  let sourceLineByPart: Map<string, { name: string; unitPrice: number; qty: number }>;

  if (direction === 'customer') {
    const sale = (await Sale.findOne({ _id: sourceId, clientId: session.clientId }).lean()) as SaleDoc | null;
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    sourceLineByPart = new Map(sale.items.map((i) => [i.partId.toString(), { name: i.name, unitPrice: i.price, qty: i.qty }]));
  } else {
    const order = (await PurchaseOrder.findOne({ _id: sourceId, clientId: session.clientId }).lean()) as PurchaseOrderDoc | null;
    if (!order) return res.status(404).json({ error: 'Purchase order not found' });
    if (order.status !== 'Received') {
      return res.status(400).json({ error: 'Only a Received purchase order can have items returned to the supplier' });
    }
    sourceLineByPart = new Map(order.items.map((i) => [i.partId.toString(), { name: i.name, unitPrice: i.unitCost, qty: i.quantity }]));
  }

  const lines: { partId: string; name: string; quantity: number; unitPrice: number }[] = [];
  let totalAmount = 0;
  for (const line of items) {
    const source = sourceLineByPart.get(line.partId!);
    if (!source) return res.status(400).json({ error: `Part ${line.partId} was not part of this ${sourceType === 'sale' ? 'sale' : 'purchase order'}` });
    const alreadyReturned = priorReturnedByPart.get(line.partId!) ?? 0;
    if (alreadyReturned + line.quantity! > source.qty) {
      return res.status(400).json({
        error: `Cannot return ${line.quantity} of "${source.name}" — only ${Math.max(0, source.qty - alreadyReturned)} left returnable`,
      });
    }
    lines.push({ partId: line.partId!, name: source.name, quantity: line.quantity!, unitPrice: source.unitPrice });
    totalAmount += line.quantity! * source.unitPrice;
  }
  totalAmount = Math.round(totalAmount * 100) / 100;

  const dbSession = await mongoose.startSession();
  try {
    let created: ReturnDoc | undefined;
    await dbSession.withTransaction(async () => {
      for (const line of lines) {
        if (direction === 'customer') {
          // Coming back into stock.
          await Part.updateOne({ _id: line.partId, clientId: session.clientId }, { $inc: { stock: line.quantity } }, { session: dbSession });
        } else {
          // Leaving stock again — check it's actually still there (it may
          // have been sold/used on a job since being received).
          const part = await Part.findOne({ _id: line.partId, clientId: session.clientId }).session(dbSession);
          if (!part || part.stock < line.quantity) {
            throw Object.assign(
              new Error(`Not enough stock of "${line.name}" to return to the supplier (have ${part?.stock ?? 0}, returning ${line.quantity})`),
              { statusCode: 400 }
            );
          }
          await Part.updateOne({ _id: line.partId, clientId: session.clientId }, { $inc: { stock: -line.quantity } }, { session: dbSession });
        }
      }

      const returnNumber = await generateSequentialNumber(Return, session.clientId, 'returnNumber', 'RET');
      const [doc] = await Return.create(
        [
          {
            clientId: session.clientId,
            direction,
            sourceType,
            sourceId,
            returnNumber,
            items: lines,
            totalAmount,
            reason: reason.trim(),
            notes,
            refundAmount: refundAmount && refundAmount > 0 ? refundAmount : undefined,
            refundMethod: refundAmount && refundAmount > 0 ? refundMethod : undefined,
            chequeNumber: refundMethod === 'Cheque' ? chequeNumber : undefined,
            bankAccountId: refundAmount && refundAmount > 0 ? bankAccountId : undefined,
            refundDate: refundAmount && refundAmount > 0 ? new Date() : undefined,
          },
        ],
        { session: dbSession }
      );
      created = doc.toObject() as ReturnDoc;
    });

    let party: string | undefined;
    let reference: string | undefined;
    if (direction === 'supplier') {
      const order = (await PurchaseOrder.findById(sourceId).lean()) as PurchaseOrderDoc | null;
      reference = order?.poNumber;
      if (order) {
        const supplier = (await Supplier.findById(order.supplierId).lean()) as SupplierDoc | null;
        party = supplier?.name;
      }
    }

    return res.status(201).json({ return: serializeReturn(created!, party, reference) });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'Failed to record return';
    return res.status(statusCode).json({ error: message });
  } finally {
    await dbSession.endSession();
  }
}
