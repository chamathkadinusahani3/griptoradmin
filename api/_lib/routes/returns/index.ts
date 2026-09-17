import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../db.js';
import { Return, ReturnDoc, RETURN_REASONS } from '../../models/Return.js';
import { Client } from '../../models/Client.js';
import { Approval } from '../../models/Approval.js';
import { CreditNote } from '../../models/CreditNote.js';
import { DebitNote } from '../../models/DebitNote.js';
import { Sale, SaleDoc } from '../../models/Sale.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../models/PurchaseOrder.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { Utilization } from '../../models/Utilization.js';
import { Part } from '../../models/Part.js';
import { requireTenantPermission } from '../../auth.js';
import { generateSequentialNumber } from '../../numbering.js';
import { effectiveReceivedQuantity } from '../../purchaseOrderReceiving.js';
import { postJournalEntry, getAccountIdsByNames, cashOrBankAccountName } from '../../journal.js';
import { applySource, applyTarget } from '../utilizations/index.js';
import { serializeReturn } from '../../serializers.js';

type ReturnReason = (typeof RETURN_REASONS)[number];

interface ReturnLineBody {
  partId?: string;
  quantity?: number;
  // Only used when sourceType is 'customer-invoice' — that source has no
  // Part reference to look a name/price up from (see Return.ts's comment),
  // so the line is described directly instead of matched against a source
  // document's own items.
  description?: string;
  unitPrice?: number;
}

interface CreateReturnBody {
  direction?: 'customer' | 'supplier';
  // Only meaningful when direction is 'customer' — defaults to 'sale' when
  // omitted, preserving this endpoint's original behavior exactly for every
  // existing caller. 'customer-invoice' is the Dealer Credit Control
  // roadmap Module 1 addition (see Return.ts's comment).
  sourceType?: 'sale' | 'customer-invoice';
  sourceId?: string;
  items?: ReturnLineBody[];
  reason?: ReturnReason;
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

  const invoiceSourceIds = returns.filter((r) => r.sourceType === 'customer-invoice').map((r) => r.sourceId);
  const invoices = invoiceSourceIds.length
    ? ((await CustomerInvoice.find({ _id: { $in: invoiceSourceIds } }).lean()) as CustomerInvoiceDoc[])
    : [];
  const customerIdByInvoiceId = new Map(invoices.map((i) => [i._id.toString(), i.customerId.toString()]));
  const invoiceCustomerIds = [...new Set([...customerIdByInvoiceId.values()])];
  const invoiceCustomers = invoiceCustomerIds.length ? ((await Customer.find({ _id: { $in: invoiceCustomerIds } }).lean()) as CustomerDoc[]) : [];
  const customerNameById = new Map(invoiceCustomers.map((c) => [c._id.toString(), c.name]));
  const invoiceNumberById = new Map(invoices.map((i) => [i._id.toString(), i.invoiceNumber]));

  return res.status(200).json({
    returns: returns.map((r) => {
      const party =
        r.sourceType === 'purchase-order' ? supplierNameById.get(supplierIdByOrderId.get(r.sourceId.toString()) ?? '') :
        r.sourceType === 'customer-invoice' ? customerNameById.get(customerIdByInvoiceId.get(r.sourceId.toString()) ?? '') :
        undefined;
      const reference =
        r.sourceType === 'purchase-order' ? poNumberById.get(r.sourceId.toString()) :
        r.sourceType === 'customer-invoice' ? invoiceNumberById.get(r.sourceId.toString()) :
        undefined;
      return serializeReturn(r, party, reference);
    }),
  });
}

interface ExecuteReturnEffectsParams {
  clientId: string;
  dbSession: mongoose.ClientSession;
  returnDoc: ReturnDoc;
  direction: 'customer' | 'supplier';
  lines: { partId?: string; name: string; quantity: number; unitPrice: number }[];
  orderSupplierId?: string;
  hasRefund: boolean;
  refundAmount?: number;
  refundMethod?: string;
  // Sales Module Phase 12 — independent of this Return's own gate. true
  // means the refund stops at 'Requested' (an Approval doc filed, GL
  // posting deferred to routes/returns/[id].ts's mark-refund-paid action);
  // false means the refund posts its GL entry right here, immediately.
  refundGated: boolean;
  actorSub: string;
  // Only needed/passed when hasRefund && !refundGated — null otherwise.
  accountIds: Map<string, string> | null;
}

interface PostReturnRefundGLParams {
  clientId: string;
  dbSession: mongoose.ClientSession;
  returnDoc: ReturnDoc;
  direction: 'customer' | 'supplier';
  refundAmount: number;
  refundMethod: string;
  accountIds: Map<string, string>;
}

/**
 * The actual refund GL entry — extracted so it can post either immediately
 * (executeReturnEffects, when Client.requireRefundApproval is off) or later
 * from routes/returns/[id].ts's mark-refund-paid action (when it's on).
 */
export async function postReturnRefundGL(params: PostReturnRefundGLParams): Promise<void> {
  const { clientId, dbSession, returnDoc, direction, refundAmount, refundMethod, accountIds } = params;
  const cashOrBankId = accountIds.get(cashOrBankAccountName(refundMethod));
  // Customer return: we hand cash back out, reversing revenue we
  // recognized earlier. Supplier return: the supplier hands cash back to
  // us, reversing the expense we recognized when we paid them (Cost of
  // Goods Sold — same account supplier payments post to).
  const contraId = accountIds.get(direction === 'customer' ? 'Sales Returns & Allowances' : 'Cost of Goods Sold');
  if (!cashOrBankId || !contraId) return;
  await postJournalEntry(
    {
      clientId,
      description: `${direction === 'customer' ? 'Customer' : 'Supplier'} return refund`,
      sourceType: 'return-refund',
      sourceId: returnDoc._id.toString(),
      lines:
        direction === 'customer'
          ? [{ accountId: contraId, debit: refundAmount }, { accountId: cashOrBankId, credit: refundAmount }]
          : [{ accountId: cashOrBankId, debit: refundAmount }, { accountId: contraId, credit: refundAmount }],
    },
    dbSession
  );
}

/**
 * The stock move + CreditNote/DebitNote creation + refund GL posting a
 * Return actually accomplishes — extracted so it can run either immediately
 * at creation (Client.requireReturnApproval off, the original always-
 * immediate behavior) or later, at Approve time, when the tenant has opted
 * into the Pending/Inspected/Approved gate (routes/returns/[id].ts). Always
 * called from inside a transaction alongside the Return document's own
 * create/status-update, so a Return is never left half-executed.
 */
export async function executeReturnEffects(params: ExecuteReturnEffectsParams): Promise<void> {
  const { clientId, dbSession, returnDoc, direction, lines, orderSupplierId, hasRefund, refundAmount, refundMethod, refundGated, actorSub, accountIds } = params;
  const totalAmount = returnDoc.totalAmount;
  const reason = returnDoc.reason;

  for (const line of lines) {
    if (direction === 'customer') {
      // Coming back into stock — skipped for a customer-invoice line with no
      // partId (see Return.ts's comment): there's no Part to identify, so
      // nothing to reverse. Staff can run a manual Stock Adjustment
      // separately if the physical goods actually came back.
      if (!line.partId) continue;
      await Part.updateOne({ _id: line.partId, clientId }, { $inc: { stock: line.quantity } }, { session: dbSession });
    } else {
      // Leaving stock again — check it's actually still there (it may have
      // been sold/used on a job since being received, or since this return
      // was first requested if the gate delayed execution).
      const part = await Part.findOne({ _id: line.partId, clientId }).session(dbSession);
      if (!part || part.stock < line.quantity) {
        throw Object.assign(
          new Error(`Not enough stock of "${line.name}" to return to the supplier (have ${part?.stock ?? 0}, returning ${line.quantity})`),
          { statusCode: 400 }
        );
      }
      await Part.updateOne({ _id: line.partId, clientId }, { $inc: { stock: -line.quantity } }, { session: dbSession });
    }
  }

  // ERP-Phase 5 — every customer-direction return gets a formal Credit Note
  // documenting the value of goods returned, whether or not cash was
  // refunded immediately. No GL posting here — the refund block below
  // already posts one when hasRefund is true; this is paperwork, not a
  // second entry.
  if (direction === 'customer') {
    const creditNoteNumber = await generateSequentialNumber(CreditNote, clientId, 'creditNoteNumber', 'creditNote');
    const appliedAmount = hasRefund ? Math.min(refundAmount ?? 0, totalAmount) : 0;
    const remainingAmount = Math.round((totalAmount - appliedAmount) * 100) / 100;
    const [creditNoteDoc] = await CreditNote.create(
      [
        {
          clientId,
          creditNoteNumber,
          returnId: returnDoc._id,
          amount: totalAmount,
          appliedAmount,
          remainingAmount,
          status: remainingAmount <= 0 ? 'Fully Applied' : 'Open',
          reason,
        },
      ],
      { session: dbSession }
    );

    // Dealer Credit Control roadmap Module 1 — a customer-invoice-sourced
    // return means the goods were billed on a specific invoice, so (absent a
    // cash refund) the natural outcome is crediting THAT invoice's balance
    // immediately rather than leaving a floating CreditNote someone has to
    // remember to apply later via Utilization. Reuses the exact same
    // applySource/applyTarget balance math Utilization's own route already
    // uses — this is just that same flow, auto-triggered. A cash refund
    // (hasRefund) is handled by the block below instead, same as a
    // Sale-sourced return; the CreditNote then stays available to apply
    // manually for any remainder.
    if (returnDoc.sourceType === 'customer-invoice' && remainingAmount > 0) {
      await applySource('creditNote', creditNoteDoc._id.toString(), clientId, remainingAmount, dbSession);
      await applyTarget(
        { kind: 'customerInvoice', outstanding: 0 },
        returnDoc.sourceId.toString(),
        clientId,
        remainingAmount,
        new Date(),
        `Auto-applied from Return ${returnDoc.returnNumber}`,
        dbSession
      );
      const utilizationNumber = await generateSequentialNumber(Utilization, clientId, 'utilizationNumber', 'utilization');
      await Utilization.create(
        [
          {
            clientId,
            utilizationNumber,
            sourceType: 'creditNote',
            sourceId: creditNoteDoc._id,
            targetType: 'invoice',
            targetId: returnDoc.sourceId,
            amount: remainingAmount,
            date: new Date(),
            notes: `Auto-applied from Return ${returnDoc.returnNumber}`,
          },
        ],
        { session: dbSession }
      );
    }
  }

  // ERP-Phase 6 — the supplier-direction mirror of the block above. Starts
  // 'Pending', not auto-confirmed — see DebitNote.ts.
  if (direction === 'supplier' && orderSupplierId) {
    const debitNoteNumber = await generateSequentialNumber(DebitNote, clientId, 'debitNoteNumber', 'debitNote');
    const appliedAmount = hasRefund ? Math.min(refundAmount ?? 0, totalAmount) : 0;
    const remainingAmount = Math.round((totalAmount - appliedAmount) * 100) / 100;
    await DebitNote.create(
      [
        {
          clientId,
          debitNoteNumber,
          returnId: returnDoc._id,
          supplierId: orderSupplierId,
          amount: totalAmount,
          appliedAmount,
          remainingAmount,
          reason,
        },
      ],
      { session: dbSession }
    );
  }

  if (hasRefund) {
    if (refundGated) {
      // Sales Module Phase 12 — GL posting deferred; filed for visibility
      // on the Approvals page, but the real state transition (and the
      // permission check for it) lives on this Return document itself via
      // routes/returns/[id].ts's approve-refund/mark-refund-paid actions —
      // same "log is for audit visibility, the action's own permission
      // gate is the real authority check" reasoning as
      // customerCreditLimitGate.ts.
      await Return.updateOne({ _id: returnDoc._id, clientId }, { $set: { refundStatus: 'Requested' } }, { session: dbSession });
      await Approval.create(
        [
          {
            clientId,
            type: 'Refund Request',
            subject: `Refund of ${refundAmount!.toFixed(2)} for return ${returnDoc.returnNumber}`,
            amount: refundAmount,
            requestedBy: actorSub,
            status: 'Pending',
          },
        ],
        { session: dbSession }
      );
    } else if (accountIds) {
      await postReturnRefundGL({ clientId, dbSession, returnDoc, direction, refundAmount: refundAmount!, refundMethod: refundMethod!, accountIds });
      await Return.updateOne(
        { _id: returnDoc._id, clientId },
        { $set: { refundStatus: 'Paid', refundPaidBy: actorSub, refundPaidAt: new Date() } },
        { session: dbSession }
      );
    }
  }
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
  if (!reason || !(RETURN_REASONS as readonly string[]).includes(reason)) {
    return res.status(400).json({ error: `reason must be one of: ${RETURN_REASONS.join(', ')}` });
  }
  const isInvoiceSourced = direction === 'customer' && body.sourceType === 'customer-invoice';
  for (const line of items) {
    if (isInvoiceSourced) {
      if (!line.description?.trim() || !line.quantity || line.quantity <= 0 || line.unitPrice == null || line.unitPrice < 0) {
        return res.status(400).json({ error: 'Each item requires a description, a positive quantity, and a unitPrice' });
      }
    } else if (!line.partId || !line.quantity || line.quantity <= 0) {
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

  const client = await Client.findById(session.clientId).select('requireReturnApproval requireRefundApproval').lean();
  const gated = !!client?.requireReturnApproval;
  const refundGated = !!client?.requireRefundApproval;

  const sourceType = direction === 'customer' ? (isInvoiceSourced ? 'customer-invoice' : 'sale') : 'purchase-order';

  const lines: { partId?: string; name: string; quantity: number; unitPrice: number }[] = [];
  let totalAmount = 0;
  let orderSupplierId: string | undefined;

  if (sourceType === 'customer-invoice') {
    const invoice = (await CustomerInvoice.findOne({ _id: sourceId, clientId: session.clientId }).lean()) as CustomerInvoiceDoc | null;
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status === 'Void') return res.status(400).json({ error: 'Cannot record a return against a voided invoice' });

    // Dealer Credit Control roadmap Module 1 — a CustomerInvoice line has no
    // Part reference to match against (see Return.ts's comment), so this is
    // capped in aggregate against the invoice's own total minus whatever's
    // already been returned (non-rejected) against it, rather than the
    // per-part-quantity cap the sale/purchase-order branches use below.
    const priorInvoiceReturns = (await Return.find({
      clientId: session.clientId,
      sourceId,
      sourceType: 'customer-invoice',
      status: { $ne: 'Rejected' },
    }).lean()) as ReturnDoc[];
    const alreadyReturned = priorInvoiceReturns.reduce((sum, r) => sum + r.totalAmount, 0);
    const returnable = Math.round((invoice.total - alreadyReturned) * 100) / 100;

    for (const line of items) {
      lines.push({ name: line.description!.trim(), quantity: line.quantity!, unitPrice: line.unitPrice! });
      totalAmount += line.quantity! * line.unitPrice!;
    }
    totalAmount = Math.round(totalAmount * 100) / 100;
    if (totalAmount > returnable + 0.005) {
      return res.status(400).json({ error: `Cannot return ${totalAmount.toFixed(2)} — only ${Math.max(0, returnable).toFixed(2)} left returnable on this invoice` });
    }
  } else {
    // Cumulative check — a source document's own line quantity is the cap
    // across every OTHER-THAN-REJECTED return ever made against it (Pending/
    // Inspected returns reserve their quantity the same way Stock
    // Reservation's provisional tally does — see stockReservation.ts — so two
    // concurrent return requests against the same source can't both pass a
    // check that together would over-return it).
    const priorReturns = (await Return.find({ clientId: session.clientId, sourceId, sourceType, status: { $ne: 'Rejected' } }).lean()) as ReturnDoc[];
    const priorReturnedByPart = new Map<string, number>();
    for (const r of priorReturns) {
      for (const line of r.items) {
        if (!line.partId) continue;
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
      if (order.status !== 'Received' && order.status !== 'Partially Received') {
        return res.status(400).json({ error: 'Only a Received (or Partially Received) purchase order can have items returned to the supplier' });
      }
      orderSupplierId = order.supplierId.toString();
      // Capped by what actually ARRIVED, not the full ordered quantity — a
      // partial delivery can't have more returned against it than showed up.
      sourceLineByPart = new Map(
        order.items.map((i) => [i.partId.toString(), { name: i.name, unitPrice: i.unitCost, qty: effectiveReceivedQuantity(i, order.status) }])
      );
    }

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
  }

  // Resolved before the transaction starts — same "doesn't need
  // transactional consistency with the stock/Return writes, only the actual
  // JournalEntry insert does" reasoning as sales/index.ts. Only meaningful
  // when the return's own effects run immediately here (!gated) AND the
  // refund itself isn't separately gated (!refundGated) — otherwise GL
  // posting is deferred and this lookup would be wasted.
  const hasRefund = !!refundAmount && refundAmount > 0;
  const accountIds = !gated && hasRefund && !refundGated
    ? await getAccountIdsByNames(session.clientId, ['Sales Returns & Allowances', 'Cost of Goods Sold', cashOrBankAccountName(refundMethod!)])
    : null;

  const dbSession = await mongoose.startSession();
  try {
    let created: ReturnDoc | undefined;
    await dbSession.withTransaction(async () => {
      const returnNumber = await generateSequentialNumber(Return, session.clientId, 'returnNumber', 'return');
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
            reason,
            notes,
            status: gated ? 'Pending' : 'Approved',
            refundAmount: hasRefund ? refundAmount : undefined,
            refundMethod: hasRefund ? refundMethod : undefined,
            chequeNumber: refundMethod === 'Cheque' ? chequeNumber : undefined,
            bankAccountId: hasRefund ? bankAccountId : undefined,
            refundDate: hasRefund ? new Date() : undefined,
          },
        ],
        { session: dbSession }
      );
      created = doc.toObject() as ReturnDoc;

      // Gate off — same immediate execution as before this phase existed.
      // Gate on — this Return sits Pending until routes/returns/[id].ts's
      // approve action runs executeReturnEffects for real.
      if (!gated) {
        await executeReturnEffects({
          clientId: session.clientId,
          dbSession,
          returnDoc: created,
          direction,
          lines,
          orderSupplierId,
          hasRefund,
          refundAmount,
          refundMethod,
          refundGated,
          actorSub: session.sub,
          accountIds,
        });
      }
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
    } else if (sourceType === 'customer-invoice') {
      const invoice = (await CustomerInvoice.findById(sourceId).lean()) as CustomerInvoiceDoc | null;
      reference = invoice?.invoiceNumber;
      if (invoice) {
        const customer = (await Customer.findById(invoice.customerId).lean()) as CustomerDoc | null;
        party = customer?.name;
      }
    }

    // Re-fetched rather than reusing the in-memory `created` captured before
    // executeReturnEffects ran — that function may have written refund-
    // lifecycle fields (refundStatus etc.) back onto this same document
    // (Sales Module Phase 12), which the stale in-memory copy won't reflect.
    const final = (await Return.findById(created!._id).lean()) as ReturnDoc;
    return res.status(201).json({ return: serializeReturn(final, party, reference) });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'Failed to record return';
    return res.status(statusCode).json({ error: message });
  } finally {
    await dbSession.endSession();
  }
}
