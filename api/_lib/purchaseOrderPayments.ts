import { PurchaseOrder, PurchaseOrderDoc } from './models/PurchaseOrder.js';
import { postJournalEntry, getAccountIdsByNames, cashOrBankAccountName } from './journal.js';

export interface RecordSupplierPaymentInput {
  amount: number;
  method: 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Other';
  date?: Date;
  notes?: string;
  chequeNumber?: string;
  bankAccountId?: string;
}

/**
 * The garage-pays-supplier mirror of recordCustomerInvoicePayment
 * (api/_lib/customerInvoicePayments.ts) — same paidAmount/balance/
 * paymentStatus math, same single-source-of-truth reasoning, just the other
 * direction of money. Only valid once a PO has left Draft (Ordered or
 * Received — a real commitment to pay), never on a Draft or Cancelled one.
 *
 * Returns null if the PO doesn't exist in this tenant, or isn't in a
 * payable state.
 */
export async function recordPurchaseOrderPayment(
  poId: string,
  clientId: string,
  input: RecordSupplierPaymentInput
): Promise<PurchaseOrderDoc | null> {
  const existing = (await PurchaseOrder.findOne({ _id: poId, clientId }).lean()) as PurchaseOrderDoc | null;
  if (!existing || (existing.status !== 'Ordered' && existing.status !== 'Partially Received' && existing.status !== 'Received')) return null;

  const paidAmount = Math.round((existing.paidAmount + input.amount) * 100) / 100;
  const balance = Math.round((existing.total - paidAmount) * 100) / 100;
  const paymentStatus = balance <= 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';

  // Same $push + $set split as recordCustomerInvoicePayment — Mongo rejects
  // mixing a top-level $push with plain fields in one update object.
  const order = (await PurchaseOrder.findOneAndUpdate(
    { _id: poId, clientId },
    {
      $set: { paidAmount, balance, paymentStatus },
      $push: {
        paymentHistory: {
          amount: input.amount,
          method: input.method,
          date: input.date ?? new Date(),
          notes: input.notes,
          chequeNumber: input.chequeNumber,
          bankAccountId: input.bankAccountId,
        },
      },
    },
    { returnDocument: 'after' }
  ).lean()) as PurchaseOrderDoc;

  // Best-effort, outside any transaction (same reasoning as
  // customerInvoicePayments.ts's identical block, the other direction of
  // money) — recognizes the expense at PAYMENT time, crediting Cash/Bank
  // and debiting Cost of Goods Sold directly rather than Accounts Payable
  // (this codebase doesn't hook PO-creation for GL purposes).
  try {
    const accountIds = await getAccountIdsByNames(clientId, [cashOrBankAccountName(input.method), 'Cost of Goods Sold']);
    const cashOrBankId = accountIds.get(cashOrBankAccountName(input.method));
    const cogsId = accountIds.get('Cost of Goods Sold');
    if (cashOrBankId && cogsId) {
      await postJournalEntry({
        clientId,
        description: `Supplier payment — ${order.poNumber}`,
        sourceType: 'supplier-payment',
        sourceId: poId,
        lines: [{ accountId: cogsId, debit: input.amount }, { accountId: cashOrBankId, credit: input.amount }],
      });
    }
  } catch (err) {
    console.error('Journal posting failed for supplier payment', poId, err);
  }

  return order;
}
