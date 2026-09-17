import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { AdvancePayment, AdvancePaymentDoc } from '../../models/AdvancePayment.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeAdvancePayment } from '../../serializers.js';
import { postJournalEntry, getAccountIdsByNames, cashOrBankAccountName } from '../../journal.js';

interface UpdateAdvancePaymentBody {
  action?: 'void';
  reason?: string;
}

// Void reverses the GL entry the create route posted — unlike Credit/Debit
// Note's Void (pure paperwork, nothing to reverse), an Advance Payment
// represents real cash that moved. Only allowed while appliedAmount is
// still 0 (nothing has drawn against it yet via the still-unbuilt Phase 11
// Utilization) — once part of it has been applied to a real invoice/PO, a
// simple full reversal would no longer be correct, and partial-reversal
// logic is deliberately out of scope here.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'advance-payments:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing advance payment id' });

  const { action, reason } = (req.body ?? {}) as UpdateAdvancePaymentBody;
  if (action !== 'void') return res.status(400).json({ error: 'action must be "void"' });
  if (!reason?.trim()) return res.status(400).json({ error: 'A reason is required to void an advance payment' });

  await connectToDatabase();

  const existing = (await AdvancePayment.findOne({ _id: id, clientId: session.clientId }).lean()) as AdvancePaymentDoc | null;
  if (!existing) return res.status(404).json({ error: 'Advance payment not found' });
  if (existing.status === 'Void') return res.status(400).json({ error: 'This advance payment is already void' });
  if ((existing.appliedAmount ?? 0) > 0) {
    return res.status(400).json({ error: 'Cannot void an advance payment that has already been partly applied' });
  }

  const payment = (await AdvancePayment.findOneAndUpdate(
    { _id: id, clientId: session.clientId, status: { $ne: 'Void' } },
    { status: 'Void', voidedAt: new Date(), voidReason: reason.trim() },
    { returnDocument: 'after' }
  ).lean()) as AdvancePaymentDoc | null;
  if (!payment) return res.status(400).json({ error: 'This advance payment changed status — refresh and try again' });

  try {
    const accountName = cashOrBankAccountName(payment.method);
    const otherAccountName = payment.direction === 'customer' ? 'Accounts Receivable' : 'Accounts Payable';
    const accountIds = await getAccountIdsByNames(session.clientId, [accountName, otherAccountName]);
    const cashOrBankId = accountIds.get(accountName);
    const otherId = accountIds.get(otherAccountName);
    if (cashOrBankId && otherId) {
      await postJournalEntry({
        clientId: session.clientId,
        description: `Voided advance payment — ${payment.advancePaymentNumber}`,
        sourceType: payment.direction === 'customer' ? 'customer-payment' : 'supplier-payment',
        sourceId: payment._id.toString(),
        // Exact swap of the create route's own lines.
        lines:
          payment.direction === 'customer'
            ? [{ accountId: otherId, debit: payment.amount }, { accountId: cashOrBankId, credit: payment.amount }]
            : [{ accountId: cashOrBankId, debit: payment.amount }, { accountId: otherId, credit: payment.amount }],
      });
    }
  } catch (err) {
    console.error('Journal reversal posting failed for voided advance payment', payment._id.toString(), err);
  }

  const [customer, supplier] = await Promise.all([
    payment.customerId ? (Customer.findById(payment.customerId).select('name').lean() as Promise<CustomerDoc | null>) : Promise.resolve(null),
    payment.supplierId ? (Supplier.findById(payment.supplierId).select('name').lean() as Promise<SupplierDoc | null>) : Promise.resolve(null),
  ]);

  return res.status(200).json({ advancePayment: serializeAdvancePayment(payment, { customerName: customer?.name, supplierName: supplier?.name }) });
}
