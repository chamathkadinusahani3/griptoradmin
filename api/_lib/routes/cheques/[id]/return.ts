import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Cheque, ChequeDoc } from '../../../models/Cheque.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../../models/CustomerInvoice.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../../models/PurchaseOrder.js';
import { requireTenantPermission } from '../../../auth.js';
import { serializeCheque } from '../../../serializers.js';
import { postJournalEntry, getAccountIdsByNames, cashOrBankAccountName } from '../../../journal.js';

interface ReturnChequeBody {
  reason?: string;
}

// "Return Cheque Entry" — the cheque bounced. Reverses whatever the
// original recordCustomerInvoicePayment()/recordPurchaseOrderPayment() call
// did: reopens the linked invoice/PO balance and posts an equal-and-opposite
// GL entry. Never mutates the original paymentHistory entry (append-only,
// same discipline as the rest of this codebase) — instead pushes a new
// negative entry, so every existing reader that sums paymentHistory amounts
// (e.g. financial-overview.ts's revenue calc) nets out correctly for free,
// without needing its own audit/rewrite.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'cheques:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing cheque id' });

  const { reason } = (req.body ?? {}) as ReturnChequeBody;
  if (!reason?.trim()) return res.status(400).json({ error: 'A reason is required' });

  await connectToDatabase();

  const existing = (await Cheque.findOne({ _id: id, clientId: session.clientId }).lean()) as ChequeDoc | null;
  if (!existing) return res.status(404).json({ error: 'Cheque not found' });
  if (existing.status === 'Returned') return res.status(400).json({ error: 'This cheque has already been returned' });

  if (existing.sourceType === 'customer-invoice-payment') {
    await reverseCustomerInvoicePayment(session.clientId, existing);
  } else {
    await reversePurchaseOrderPayment(session.clientId, existing);
  }

  const cheque = (await Cheque.findOneAndUpdate(
    { _id: id, clientId: session.clientId, status: { $ne: 'Returned' } },
    { status: 'Returned', returnedAt: new Date(), returnedReason: reason.trim() },
    { returnDocument: 'after' }
  ).lean()) as ChequeDoc | null;
  if (!cheque) return res.status(400).json({ error: 'This cheque changed status — refresh and try again' });

  return res.status(200).json({ cheque: serializeCheque(cheque) });
}

async function reverseCustomerInvoicePayment(clientId: string, cheque: ChequeDoc) {
  const invoice = (await CustomerInvoice.findOne({ _id: cheque.sourceId, clientId }).lean()) as CustomerInvoiceDoc | null;
  if (!invoice) return;

  const paidAmount = Math.max(0, Math.round((invoice.paidAmount - cheque.amount) * 100) / 100);
  const balance = Math.round((invoice.total - paidAmount) * 100) / 100;
  const paymentStatus = balance <= 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';
  const status = paymentStatus === 'Paid' ? 'Paid' : invoice.status === 'Paid' ? 'Issued' : invoice.status;

  await CustomerInvoice.updateOne(
    { _id: cheque.sourceId, clientId },
    {
      $set: { paidAmount, balance, paymentStatus, status },
      $push: {
        paymentHistory: {
          amount: -cheque.amount,
          method: 'Cheque',
          date: new Date(),
          notes: `Cheque #${cheque.chequeNumber} returned`,
          chequeNumber: cheque.chequeNumber,
          bankAccountId: cheque.bankAccountId,
        },
      },
    }
  );

  try {
    const accountIds = await getAccountIdsByNames(clientId, [cashOrBankAccountName('Cheque'), 'Service Revenue']);
    const cashOrBankId = accountIds.get(cashOrBankAccountName('Cheque'));
    const revenueId = accountIds.get('Service Revenue');
    if (cashOrBankId && revenueId) {
      await postJournalEntry({
        clientId,
        description: `Returned cheque — ${invoice.invoiceNumber} (#${cheque.chequeNumber})`,
        sourceType: 'customer-payment',
        sourceId: cheque.sourceId.toString(),
        lines: [{ accountId: revenueId, debit: cheque.amount }, { accountId: cashOrBankId, credit: cheque.amount }],
      });
    }
  } catch (err) {
    console.error('Journal reversal posting failed for returned cheque', cheque._id.toString(), err);
  }
}

async function reversePurchaseOrderPayment(clientId: string, cheque: ChequeDoc) {
  const order = (await PurchaseOrder.findOne({ _id: cheque.sourceId, clientId }).lean()) as PurchaseOrderDoc | null;
  if (!order) return;

  const paidAmount = Math.max(0, Math.round((order.paidAmount - cheque.amount) * 100) / 100);
  const balance = Math.round((order.total - paidAmount) * 100) / 100;
  const paymentStatus = balance <= 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';

  await PurchaseOrder.updateOne(
    { _id: cheque.sourceId, clientId },
    {
      $set: { paidAmount, balance, paymentStatus },
      $push: {
        paymentHistory: {
          amount: -cheque.amount,
          method: 'Cheque',
          date: new Date(),
          notes: `Cheque #${cheque.chequeNumber} returned`,
          chequeNumber: cheque.chequeNumber,
          bankAccountId: cheque.bankAccountId,
        },
      },
    }
  );

  try {
    const accountIds = await getAccountIdsByNames(clientId, [cashOrBankAccountName('Cheque'), 'Cost of Goods Sold']);
    const cashOrBankId = accountIds.get(cashOrBankAccountName('Cheque'));
    const cogsId = accountIds.get('Cost of Goods Sold');
    if (cashOrBankId && cogsId) {
      await postJournalEntry({
        clientId,
        description: `Returned cheque — ${order.poNumber} (#${cheque.chequeNumber})`,
        sourceType: 'supplier-payment',
        sourceId: cheque.sourceId.toString(),
        lines: [{ accountId: cashOrBankId, debit: cheque.amount }, { accountId: cogsId, credit: cheque.amount }],
      });
    }
  } catch (err) {
    console.error('Journal reversal posting failed for returned cheque', cheque._id.toString(), err);
  }
}
