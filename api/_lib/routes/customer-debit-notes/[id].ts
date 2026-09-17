import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../db.js';
import { CustomerDebitNote, CustomerDebitNoteDoc } from '../../models/CustomerDebitNote.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeCustomerDebitNote } from '../../serializers.js';
import { respondToApprovalGate } from '../../approvalGate.js';

interface UpdateCustomerDebitNoteBody {
  action?: 'confirm' | 'void';
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

  const session = await requireTenantPermission(req, res, 'customer-debit-notes:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing debit note id' });

  const { action, reason } = (req.body ?? {}) as UpdateCustomerDebitNoteBody;
  if (action !== 'confirm' && action !== 'void') return res.status(400).json({ error: 'action must be "confirm" or "void"' });

  await connectToDatabase();

  const existing = (await CustomerDebitNote.findOne({ _id: id, clientId: session.clientId }).lean()) as CustomerDebitNoteDoc | null;
  if (!existing) return res.status(404).json({ error: 'Debit note not found' });

  let note: CustomerDebitNoteDoc | null = null;

  if (action === 'void') {
    // Deliberately restricted to Pending only — see CustomerDebitNote.ts's
    // own comment on why a Confirmed one (already billed to the invoice)
    // isn't reversible in this first cut.
    if (existing.status !== 'Pending') {
      return res.status(400).json({ error: 'Only a Pending debit note can be voided — a Confirmed one has already billed the invoice and cannot be reversed' });
    }
    if (!reason?.trim()) return res.status(400).json({ error: 'A reason is required to void a debit note' });
    note = (await CustomerDebitNote.findOneAndUpdate(
      { _id: id, clientId: session.clientId, status: 'Pending' },
      { status: 'Void', voidedAt: new Date(), voidReason: reason.trim() },
      { returnDocument: 'after' }
    ).lean()) as CustomerDebitNoteDoc | null;
    if (!note) return res.status(400).json({ error: 'This debit note changed status — refresh and try again' });
  } else {
    if (existing.status !== 'Pending') return res.status(400).json({ error: 'Only a Pending debit note can be confirmed' });

    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        // Same optimistic-concurrency guard as every other approvalGate
        // consumer (the Pending-status filter itself), now inside a
        // transaction so the status flip and the invoice billing either
        // both happen or neither does.
        const confirmed = await respondToApprovalGate<CustomerDebitNoteDoc>(
          CustomerDebitNote,
          { _id: id, clientId: session.clientId },
          'Pending',
          'Confirmed',
          session.sub,
          undefined,
          dbSession
        );
        if (!confirmed) throw httpError(400, 'This debit note changed status — refresh and try again');

        const invoice = (await CustomerInvoice.findOne({ _id: confirmed.customerInvoiceId, clientId: session.clientId }).session(dbSession).lean()) as CustomerInvoiceDoc | null;
        if (!invoice) throw httpError(400, 'The invoice this debit note was raised against no longer exists');
        if (invoice.status === 'Void') throw httpError(400, 'Cannot confirm — the invoice this debit note was raised against has since been voided');

        const total = Math.round((invoice.total + confirmed.amount) * 100) / 100;
        const balance = Math.round((total - invoice.paidAmount) * 100) / 100;
        const paymentStatus = balance <= 0 ? 'Paid' : invoice.paidAmount > 0 ? 'Partial' : 'Unpaid';
        // Reopens a previously-Paid invoice back to Issued now that it owes
        // more — Draft/Issued stay as they are.
        const status = invoice.status === 'Paid' && balance > 0 ? 'Issued' : invoice.status;

        await CustomerInvoice.updateOne(
          { _id: confirmed.customerInvoiceId, clientId: session.clientId },
          { $set: { total, balance, paymentStatus, status } },
          { session: dbSession }
        );

        note = confirmed;
      });
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      const message = err instanceof Error ? err.message : 'Failed to confirm debit note';
      return res.status(statusCode).json({ error: message });
    } finally {
      await dbSession.endSession();
    }
  }

  const confirmedNote = note as CustomerDebitNoteDoc;
  const [invoice, customer] = await Promise.all([
    CustomerInvoice.findById(confirmedNote.customerInvoiceId).select('invoiceNumber').lean() as Promise<CustomerInvoiceDoc | null>,
    Customer.findById(confirmedNote.customerId).select('name').lean() as Promise<CustomerDoc | null>,
  ]);

  return res.status(200).json({ customerDebitNote: serializeCustomerDebitNote(confirmedNote, invoice?.invoiceNumber, customer?.name) });
}
