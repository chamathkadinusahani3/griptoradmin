import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../db.js';
import { Utilization, UtilizationDoc, UTILIZATION_SOURCE_TYPES, UTILIZATION_TARGET_TYPES } from '../../models/Utilization.js';
import { CreditNote, CreditNoteDoc } from '../../models/CreditNote.js';
import { DebitNote, DebitNoteDoc } from '../../models/DebitNote.js';
import { AdvancePayment, AdvancePaymentDoc } from '../../models/AdvancePayment.js';
import { Receipt, ReceiptDoc } from '../../models/Receipt.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../models/PurchaseOrder.js';
import { Return, ReturnDoc } from '../../models/Return.js';
import { requireTenantPermission } from '../../auth.js';
import { generateSequentialNumber } from '../../numbering.js';
import { serializeUtilization } from '../../serializers.js';

type SourceType = (typeof UTILIZATION_SOURCE_TYPES)[number];
type TargetType = (typeof UTILIZATION_TARGET_TYPES)[number];
type Direction = 'customer' | 'supplier';

const SOURCE_LABELS: Record<SourceType, string> = {
  creditNote: 'Credit Note',
  debitNote: 'Debit Note',
  advancePayment: 'Advance Payment',
  receipt: 'Receipt',
};
const SOURCE_NUMBER_FIELD: Record<SourceType, string> = {
  creditNote: 'creditNoteNumber',
  debitNote: 'debitNoteNumber',
  advancePayment: 'advancePaymentNumber',
  receipt: 'receiptNumber',
};
const SOURCE_MODEL: Record<SourceType, mongoose.Model<any>> = {
  creditNote: CreditNote,
  debitNote: DebitNote,
  advancePayment: AdvancePayment,
  receipt: Receipt,
};

interface CreateUtilizationBody {
  sourceType?: SourceType;
  sourceId?: string;
  targetType?: TargetType;
  targetId?: string;
  amount?: number;
  date?: string;
  notes?: string;
}

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function withLabels(clientId: string, utilizations: UtilizationDoc[]) {
  if (utilizations.length === 0) return [];

  const sourceLabelById = new Map<string, string>();
  for (const type of UTILIZATION_SOURCE_TYPES) {
    const ids = utilizations.filter((u) => u.sourceType === type).map((u) => u.sourceId.toString());
    if (ids.length === 0) continue;
    const field = SOURCE_NUMBER_FIELD[type];
    const docs = (await SOURCE_MODEL[type].find({ _id: { $in: ids }, clientId }).select(field).lean()) as Record<string, unknown>[];
    for (const d of docs) sourceLabelById.set((d._id as { toString(): string }).toString(), d[field] as string);
  }

  const invoiceTargetIds = utilizations.filter((u) => u.targetType === 'invoice').map((u) => u.targetId.toString());
  const returnTargetIds = utilizations.filter((u) => u.targetType === 'return').map((u) => u.targetId.toString());
  const targetLabelById = new Map<string, string>();
  if (invoiceTargetIds.length > 0) {
    const invoices = (await CustomerInvoice.find({ _id: { $in: invoiceTargetIds }, clientId }).select('invoiceNumber').lean()) as { _id: unknown; invoiceNumber: string }[];
    for (const d of invoices) targetLabelById.set((d._id as { toString(): string }).toString(), d.invoiceNumber);
    const orders = (await PurchaseOrder.find({ _id: { $in: invoiceTargetIds }, clientId }).select('poNumber').lean()) as { _id: unknown; poNumber: string }[];
    for (const d of orders) targetLabelById.set((d._id as { toString(): string }).toString(), d.poNumber);
  }
  if (returnTargetIds.length > 0) {
    const returns = (await Return.find({ _id: { $in: returnTargetIds }, clientId }).select('returnNumber').lean()) as { _id: unknown; returnNumber: string }[];
    for (const d of returns) targetLabelById.set((d._id as { toString(): string }).toString(), d.returnNumber);
  }

  return utilizations.map((u) =>
    serializeUtilization(u, sourceLabelById.get(u.sourceId.toString()), targetLabelById.get(u.targetId.toString()))
  );
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'utilizations:view');
  if (!session) return;

  await connectToDatabase();
  const utilizations = (await Utilization.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as UtilizationDoc[];
  return res.status(200).json({ utilizations: await withLabels(session.clientId, utilizations) });
}

interface SourceInfo {
  remaining: number;
  direction: Direction;
  excludeReturnId?: string;
  number: string;
  error?: string;
}

async function loadSource(sourceType: SourceType, sourceId: string, clientId: string, dbSession: mongoose.ClientSession): Promise<SourceInfo | null> {
  if (sourceType === 'creditNote') {
    const doc = (await CreditNote.findOne({ _id: sourceId, clientId }).session(dbSession).lean()) as CreditNoteDoc | null;
    if (!doc) return null;
    if (doc.status === 'Void') return { remaining: 0, direction: 'customer', number: doc.creditNoteNumber, error: 'This credit note has been voided' };
    return { remaining: doc.remainingAmount, direction: 'customer', excludeReturnId: doc.returnId.toString(), number: doc.creditNoteNumber };
  }
  if (sourceType === 'debitNote') {
    const doc = (await DebitNote.findOne({ _id: sourceId, clientId }).session(dbSession).lean()) as DebitNoteDoc | null;
    if (!doc) return null;
    if (doc.status === 'Void') return { remaining: 0, direction: 'supplier', number: doc.debitNoteNumber, error: 'This debit note has been voided' };
    if (doc.status !== 'Confirmed') {
      return { remaining: 0, direction: 'supplier', number: doc.debitNoteNumber, error: 'This debit note must be confirmed before it can be utilized' };
    }
    return { remaining: doc.remainingAmount, direction: 'supplier', excludeReturnId: doc.returnId.toString(), number: doc.debitNoteNumber };
  }
  if (sourceType === 'advancePayment') {
    const doc = (await AdvancePayment.findOne({ _id: sourceId, clientId }).session(dbSession).lean()) as AdvancePaymentDoc | null;
    if (!doc) return null;
    if (doc.status === 'Void') return { remaining: 0, direction: doc.direction as Direction, number: doc.advancePaymentNumber, error: 'This advance payment has been voided' };
    return { remaining: doc.remainingAmount, direction: doc.direction as Direction, number: doc.advancePaymentNumber };
  }
  // receipt
  const doc = (await Receipt.findOne({ _id: sourceId, clientId }).session(dbSession).lean()) as ReceiptDoc | null;
  if (!doc) return null;
  const remaining = Math.round((doc.onAccountAmount - (doc.onAccountAppliedAmount ?? 0)) * 100) / 100;
  return { remaining, direction: 'customer', number: doc.receiptNumber };
}

interface TargetInfo {
  kind: 'customerInvoice' | 'purchaseOrder' | 'return';
  outstanding: number;
  error?: string;
}

async function loadTarget(
  targetType: TargetType,
  targetId: string,
  clientId: string,
  direction: Direction,
  excludeReturnId: string | undefined,
  dbSession: mongoose.ClientSession
): Promise<TargetInfo | null> {
  if (targetType === 'invoice') {
    if (direction === 'customer') {
      const doc = (await CustomerInvoice.findOne({ _id: targetId, clientId }).session(dbSession).lean()) as CustomerInvoiceDoc | null;
      if (!doc) return null;
      if (doc.status === 'Void') return { kind: 'customerInvoice', outstanding: 0, error: 'This invoice has been voided' };
      return { kind: 'customerInvoice', outstanding: Math.round((doc.total - doc.paidAmount) * 100) / 100 };
    }
    const doc = (await PurchaseOrder.findOne({ _id: targetId, clientId }).session(dbSession).lean()) as PurchaseOrderDoc | null;
    if (!doc) return null;
    if (!['Ordered', 'Partially Received', 'Received'].includes(doc.status)) {
      return { kind: 'purchaseOrder', outstanding: 0, error: 'This purchase order is not in a payable state' };
    }
    return { kind: 'purchaseOrder', outstanding: Math.round((doc.total - doc.paidAmount - doc.settlementDiscountTotal) * 100) / 100 };
  }
  // return
  const doc = (await Return.findOne({ _id: targetId, clientId }).session(dbSession).lean()) as ReturnDoc | null;
  if (!doc) return null;
  if (doc.direction !== direction) {
    return { kind: 'return', outstanding: 0, error: `This return is ${doc.direction}-direction; the source is ${direction}-direction` };
  }
  if (excludeReturnId && doc._id.toString() === excludeReturnId) {
    return { kind: 'return', outstanding: 0, error: 'Cannot apply a credit/debit note against the return it originated from' };
  }
  const outstanding = Math.round((doc.totalAmount - (doc.refundAmount ?? 0)) * 100) / 100;
  return { kind: 'return', outstanding };
}

async function applySource(sourceType: SourceType, sourceId: string, clientId: string, amount: number, dbSession: mongoose.ClientSession) {
  if (sourceType === 'receipt') {
    const doc = (await Receipt.findOne({ _id: sourceId, clientId }).session(dbSession)) as mongoose.Document & ReceiptDoc;
    const onAccountAppliedAmount = Math.round(((doc.onAccountAppliedAmount ?? 0) + amount) * 100) / 100;
    await Receipt.updateOne({ _id: sourceId, clientId }, { $set: { onAccountAppliedAmount } }, { session: dbSession });
    return;
  }
  const model = SOURCE_MODEL[sourceType];
  const doc = (await model.findOne({ _id: sourceId, clientId }).session(dbSession).lean()) as { appliedAmount: number; remainingAmount: number; status: string };
  const appliedAmount = Math.round((doc.appliedAmount + amount) * 100) / 100;
  const remainingAmount = Math.round((doc.remainingAmount - amount) * 100) / 100;
  // DebitNote has no 'Fully Applied' status in its enum (only
  // Pending/Confirmed/Void) — stays 'Confirmed' once fully applied, unlike
  // CreditNote/AdvancePayment which both have a real 'Fully Applied' state.
  const statusUpdate = sourceType !== 'debitNote' && remainingAmount <= 0 ? { status: 'Fully Applied' } : {};
  await model.updateOne({ _id: sourceId, clientId }, { $set: { appliedAmount, remainingAmount, ...statusUpdate } }, { session: dbSession });
}

async function applyTarget(
  targetInfo: TargetInfo,
  targetId: string,
  clientId: string,
  amount: number,
  date: Date,
  historyNote: string,
  dbSession: mongoose.ClientSession
) {
  if (targetInfo.kind === 'customerInvoice') {
    const doc = (await CustomerInvoice.findOne({ _id: targetId, clientId }).session(dbSession).lean()) as CustomerInvoiceDoc;
    const paidAmount = Math.round((doc.paidAmount + amount) * 100) / 100;
    const balance = Math.round((doc.total - paidAmount) * 100) / 100;
    const paymentStatus = balance <= 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';
    await CustomerInvoice.updateOne(
      { _id: targetId, clientId },
      {
        $set: { paidAmount, balance, paymentStatus, status: paymentStatus === 'Paid' ? 'Paid' : doc.status },
        $push: { paymentHistory: { amount, method: 'Other', date, notes: historyNote } },
      },
      { session: dbSession }
    );
    return;
  }
  if (targetInfo.kind === 'purchaseOrder') {
    const doc = (await PurchaseOrder.findOne({ _id: targetId, clientId }).session(dbSession).lean()) as PurchaseOrderDoc;
    const paidAmount = Math.round((doc.paidAmount + amount) * 100) / 100;
    const balance = Math.round((doc.total - paidAmount - doc.settlementDiscountTotal) * 100) / 100;
    const paymentStatus = balance <= 0 ? 'Paid' : paidAmount + doc.settlementDiscountTotal > 0 ? 'Partial' : 'Unpaid';
    await PurchaseOrder.updateOne(
      { _id: targetId, clientId },
      {
        $set: { paidAmount, balance, paymentStatus },
        $push: { paymentHistory: { amount, method: 'Other', date, notes: historyNote } },
      },
      { session: dbSession }
    );
    return;
  }
  // return
  const doc = (await Return.findOne({ _id: targetId, clientId }).session(dbSession).lean()) as ReturnDoc;
  const refundAmount = Math.round(((doc.refundAmount ?? 0) + amount) * 100) / 100;
  await Return.updateOne({ _id: targetId, clientId }, { $set: { refundAmount } }, { session: dbSession });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'utilizations:manage');
  if (!session) return;

  const { sourceType, sourceId, targetType, targetId, amount, date, notes } = (req.body ?? {}) as CreateUtilizationBody;

  if (!sourceType || !(UTILIZATION_SOURCE_TYPES as readonly string[]).includes(sourceType)) {
    return res.status(400).json({ error: `sourceType must be one of: ${UTILIZATION_SOURCE_TYPES.join(', ')}` });
  }
  if (!targetType || !(UTILIZATION_TARGET_TYPES as readonly string[]).includes(targetType)) {
    return res.status(400).json({ error: `targetType must be one of: ${UTILIZATION_TARGET_TYPES.join(', ')}` });
  }
  if (!sourceId || !targetId) return res.status(400).json({ error: 'sourceId and targetId are required' });
  if (amount == null || amount <= 0) return res.status(400).json({ error: 'A positive amount is required' });
  if (!date) return res.status(400).json({ error: 'date is required' });

  await connectToDatabase();

  const dbSession = await mongoose.startSession();
  try {
    let createdId = '';
    await dbSession.withTransaction(async () => {
      const sourceInfo = await loadSource(sourceType, sourceId, session.clientId, dbSession);
      if (!sourceInfo) throw httpError(404, 'Source document not found');
      if (sourceInfo.error) throw httpError(400, sourceInfo.error);
      if (amount > sourceInfo.remaining + 0.005) {
        throw httpError(400, `Amount exceeds the source's remaining balance (${sourceInfo.remaining.toFixed(2)})`);
      }

      const targetInfo = await loadTarget(targetType, targetId, session.clientId, sourceInfo.direction, sourceInfo.excludeReturnId, dbSession);
      if (!targetInfo) throw httpError(404, 'Target document not found');
      if (targetInfo.error) throw httpError(400, targetInfo.error);
      if (amount > targetInfo.outstanding + 0.005) {
        throw httpError(400, `Amount exceeds the target's outstanding balance (${targetInfo.outstanding.toFixed(2)})`);
      }

      const utilizationNumber = await generateSequentialNumber(Utilization, session.clientId, 'utilizationNumber', 'utilization');
      const historyNote = `Utilization ${utilizationNumber} — applied from ${SOURCE_LABELS[sourceType]} ${sourceInfo.number}`;

      await applySource(sourceType, sourceId, session.clientId, amount, dbSession);
      await applyTarget(targetInfo, targetId, session.clientId, amount, new Date(date), historyNote, dbSession);

      const [doc] = await Utilization.create(
        [{ clientId: session.clientId, utilizationNumber, sourceType, sourceId, targetType, targetId, amount, date: new Date(date), notes }],
        { session: dbSession }
      );
      createdId = doc._id.toString();
    });

    if (!createdId) throw new Error('Transaction completed without producing a result');
    const created = (await Utilization.findById(createdId).lean()) as UtilizationDoc;
    const [serialized] = await withLabels(session.clientId, [created]);
    return res.status(201).json({ utilization: serialized });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'Failed to record utilization';
    return res.status(statusCode).json({ error: message });
  } finally {
    await dbSession.endSession();
  }
}
