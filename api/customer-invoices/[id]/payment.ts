import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../_lib/db';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../_lib/models/CustomerInvoice';
import { Customer, CustomerDoc } from '../../_lib/models/Customer';
import { requireTenant } from '../../_lib/auth';
import { serializeCustomerInvoice } from '../../_lib/serializers';
import { hasAddOn } from '../../_lib/entitlements';
import { awardPoints } from '../../_lib/loyalty';

interface RecordPaymentBody {
  amount?: number;
  method?: 'Cash' | 'Card' | 'Bank Transfer' | 'Other';
  date?: string;
  notes?: string;
}

// Manual payment recording — no real payment gateway exists in this project
// (same standing gap as everywhere else money-related here). This is the
// one piece of the Anura reference kept close to its original shape: real
// server-side computation of paidAmount/balance/paymentStatus from the
// payment history, never trusted from the client.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing invoice id' });

  const { amount, method, date, notes } = (req.body ?? {}) as RecordPaymentBody;
  if (!amount || amount <= 0 || !method) {
    return res.status(400).json({ error: 'A positive amount and a payment method are required' });
  }

  await connectToDatabase();

  const existing = (await CustomerInvoice.findOne({ _id: id, clientId: session.clientId }).lean()) as CustomerInvoiceDoc | null;
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });
  if (existing.status === 'Void') return res.status(400).json({ error: 'Cannot record a payment on a void invoice' });

  const paidAmount = Math.round((existing.paidAmount + amount) * 100) / 100;
  const balance = Math.round((existing.total - paidAmount) * 100) / 100;
  const paymentStatus = balance <= 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';

  // Mongo rejects an update object that mixes a top-level $push with plain
  // (non-$) fields — wrap the plain fields in $set too (same gotcha hit
  // during the original Support Tickets work).
  const invoice = (await CustomerInvoice.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    {
      $set: {
        paidAmount,
        balance,
        paymentStatus,
        status: paymentStatus === 'Paid' ? 'Paid' : existing.status,
      },
      $push: { paymentHistory: { amount, method, date: date ? new Date(date) : new Date(), notes } },
    },
    { returnDocument: 'after' }
  ).lean()) as CustomerInvoiceDoc;

  const customer = (await Customer.findById(invoice.customerId).lean()) as CustomerDoc | null;

  // Award loyalty points exactly once — only on the transition INTO 'Paid',
  // never on a re-save of an already-paid invoice (the same
  // "just transitioned" guard used for Customer.visits on job completion
  // and startedAt/completedAt on job cards).
  const justPaid = existing.paymentStatus !== 'Paid' && paymentStatus === 'Paid';
  if (justPaid && (await hasAddOn(session.clientId, 'crm-loyalty'))) {
    await awardPoints(session.clientId, invoice.customerId.toString(), invoice.total, invoice._id.toString());
  }

  return res.status(200).json({ invoice: serializeCustomerInvoice(invoice, customer?.name) });
}
