import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../db.js';
import { Return, ReturnDoc } from '../../models/Return.js';
import { Client } from '../../models/Client.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../models/PurchaseOrder.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { getAccountIdsByNames, cashOrBankAccountName } from '../../journal.js';
import { serializeReturn } from '../../serializers.js';
import { executeReturnEffects, postReturnRefundGL } from './index.js';

type Action = 'inspect' | 'approve' | 'reject' | 'approve-refund' | 'mark-refund-paid';
const ACTIONS: Action[] = ['inspect', 'approve', 'reject', 'approve-refund', 'mark-refund-paid'];

interface UpdateReturnBody {
  action?: Action;
  reason?: string;
}

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, reason } = (req.body ?? {}) as UpdateReturnBody;
  if (!action || !ACTIONS.includes(action)) {
    return res.status(400).json({ error: `action must be one of: ${ACTIONS.join(', ')}` });
  }

  // Sales Module Phase 12 — approve-refund IS the approval (a hard
  // permission gate, same "confirm step" shape as DebitNote.ts), so it
  // needs approvals:respond rather than the regular returns:manage every
  // other action here uses.
  const permission = action === 'approve-refund' ? 'approvals:respond' : 'returns:manage';
  const session = await requireTenantPermission(req, res, permission);
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing return id' });

  await connectToDatabase();

  const existing = (await Return.findOne({ _id: id, clientId: session.clientId }).lean()) as ReturnDoc | null;
  if (!existing) return res.status(404).json({ error: 'Return not found' });
  const currentStatus = existing.status ?? 'Approved';

  if (action === 'inspect') {
    if (currentStatus !== 'Pending') return res.status(400).json({ error: 'Only a Pending return can be inspected' });
    const updated = (await Return.findOneAndUpdate(
      { _id: id, clientId: session.clientId, status: 'Pending' },
      { status: 'Inspected', inspectedBy: session.sub, inspectedAt: new Date() },
      { returnDocument: 'after' }
    ).lean()) as ReturnDoc | null;
    if (!updated) return res.status(400).json({ error: 'This return changed status — refresh and try again' });
    return res.status(200).json({ return: await withLabels(updated) });
  }

  if (action === 'reject') {
    if (currentStatus !== 'Pending' && currentStatus !== 'Inspected') {
      return res.status(400).json({ error: 'Only a Pending or Inspected return can be rejected' });
    }
    if (!reason?.trim()) return res.status(400).json({ error: 'A reason is required to reject a return' });
    const updated = (await Return.findOneAndUpdate(
      { _id: id, clientId: session.clientId, status: currentStatus },
      { status: 'Rejected', rejectedBy: session.sub, rejectedAt: new Date(), rejectionReason: reason.trim() },
      { returnDocument: 'after' }
    ).lean()) as ReturnDoc | null;
    if (!updated) return res.status(400).json({ error: 'This return changed status — refresh and try again' });
    return res.status(200).json({ return: await withLabels(updated) });
  }

  if (action === 'approve-refund') {
    if (existing.refundStatus !== 'Requested') {
      return res.status(400).json({ error: 'Only a Requested refund can be approved' });
    }
    const updated = (await Return.findOneAndUpdate(
      { _id: id, clientId: session.clientId, refundStatus: 'Requested' },
      { refundStatus: 'Approved', refundApprovedBy: session.sub, refundApprovedAt: new Date() },
      { returnDocument: 'after' }
    ).lean()) as ReturnDoc | null;
    if (!updated) return res.status(400).json({ error: "This return's refund changed status — refresh and try again" });
    return res.status(200).json({ return: await withLabels(updated) });
  }

  if (action === 'mark-refund-paid') {
    if (existing.refundStatus !== 'Approved') {
      return res.status(400).json({ error: 'Only an Approved refund can be marked paid' });
    }
    // Resolved before the transaction starts — same reasoning as every
    // other GL-posting route in this app.
    const accountIds = await getAccountIdsByNames(session.clientId, [
      'Sales Returns & Allowances',
      'Cost of Goods Sold',
      cashOrBankAccountName(existing.refundMethod!),
    ]);

    const dbSession = await mongoose.startSession();
    let paid: ReturnDoc | null = null;
    try {
      await dbSession.withTransaction(async () => {
        const updated = (await Return.findOneAndUpdate(
          { _id: id, clientId: session.clientId, refundStatus: 'Approved' },
          { refundStatus: 'Paid', refundPaidBy: session.sub, refundPaidAt: new Date() },
          { returnDocument: 'after', session: dbSession }
        ).lean()) as ReturnDoc | null;
        if (!updated) throw httpError(400, "This return's refund changed status — refresh and try again");

        await postReturnRefundGL({
          clientId: session.clientId,
          dbSession,
          returnDoc: updated,
          direction: updated.direction as 'customer' | 'supplier',
          refundAmount: updated.refundAmount!,
          refundMethod: updated.refundMethod!,
          accountIds,
        });

        paid = updated;
      });
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      const message = err instanceof Error ? err.message : 'Failed to mark refund as paid';
      return res.status(statusCode).json({ error: message });
    } finally {
      await dbSession.endSession();
    }

    if (!paid) return res.status(500).json({ error: 'Unexpected error marking refund as paid' });
    return res.status(200).json({ return: await withLabels(paid) });
  }

  // approve
  if (currentStatus !== 'Pending' && currentStatus !== 'Inspected') {
    return res.status(400).json({ error: 'Only a Pending or Inspected return can be approved' });
  }

  // Re-derived exactly as routes/returns/index.ts's handleCreate does at
  // creation time — a supplier-direction return's DebitNote needs the
  // originating PurchaseOrder's supplierId, and this document doesn't store
  // it directly.
  let orderSupplierId: string | undefined;
  if (existing.direction === 'supplier') {
    const order = (await PurchaseOrder.findById(existing.sourceId).select('supplierId').lean()) as PurchaseOrderDoc | null;
    orderSupplierId = order?.supplierId?.toString();
  }

  const client = await Client.findById(session.clientId).select('requireRefundApproval').lean();
  const refundGated = !!client?.requireRefundApproval;

  const hasRefund = !!existing.refundAmount && existing.refundAmount > 0;
  const accountIds = hasRefund && !refundGated
    ? await getAccountIdsByNames(session.clientId, ['Sales Returns & Allowances', 'Cost of Goods Sold', cashOrBankAccountName(existing.refundMethod!)])
    : null;

  const dbSession = await mongoose.startSession();
  let approvedId: string | undefined;
  try {
    await dbSession.withTransaction(async () => {
      const updated = (await Return.findOneAndUpdate(
        { _id: id, clientId: session.clientId, status: currentStatus },
        { status: 'Approved', approvedBy: session.sub, approvedAt: new Date() },
        { returnDocument: 'after', session: dbSession }
      ).lean()) as ReturnDoc | null;
      if (!updated) throw httpError(400, 'This return changed status — refresh and try again');

      await executeReturnEffects({
        clientId: session.clientId,
        dbSession,
        returnDoc: updated,
        direction: updated.direction as 'customer' | 'supplier',
        lines: updated.items.map((i) => ({ partId: i.partId?.toString(), name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
        orderSupplierId,
        hasRefund,
        refundAmount: existing.refundAmount ?? undefined,
        refundMethod: existing.refundMethod ?? undefined,
        refundGated,
        actorSub: session.sub,
        accountIds,
      });

      approvedId = updated._id.toString();
    });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'Failed to approve return';
    return res.status(statusCode).json({ error: message });
  } finally {
    await dbSession.endSession();
  }

  if (!approvedId) return res.status(500).json({ error: 'Approval completed without producing a result' });
  // Re-fetched rather than reusing the in-memory `approved` captured before
  // executeReturnEffects ran — that function may have written refund-
  // lifecycle fields (refundStatus etc.) back onto this same document
  // (Sales Module Phase 12), which the stale in-memory copy won't reflect.
  const final = (await Return.findById(approvedId).lean()) as ReturnDoc;
  return res.status(200).json({ return: await withLabels(final) });
}

async function withLabels(ret: ReturnDoc) {
  let party: string | undefined;
  let reference: string | undefined;
  if (ret.sourceType === 'purchase-order') {
    const order = (await PurchaseOrder.findById(ret.sourceId).lean()) as PurchaseOrderDoc | null;
    reference = order?.poNumber;
    if (order) {
      const supplier = (await Supplier.findById(order.supplierId).lean()) as SupplierDoc | null;
      party = supplier?.name;
    }
  } else if (ret.sourceType === 'customer-invoice') {
    const invoice = (await CustomerInvoice.findById(ret.sourceId).lean()) as CustomerInvoiceDoc | null;
    reference = invoice?.invoiceNumber;
    if (invoice) {
      const customer = (await Customer.findById(invoice.customerId).lean()) as CustomerDoc | null;
      party = customer?.name;
    }
  }
  return serializeReturn(ret, party, reference);
}
