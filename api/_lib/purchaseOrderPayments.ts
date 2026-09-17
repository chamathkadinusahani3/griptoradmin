import { PurchaseOrder, PurchaseOrderDoc } from './models/PurchaseOrder.js';
import { Cheque } from './models/Cheque.js';
import { postJournalEntry, getAccountIdsByNames, cashOrBankAccountName } from './journal.js';

export interface RecordSupplierPaymentInput {
  amount: number;
  method: 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Other';
  date?: Date;
  notes?: string;
  chequeNumber?: string;
  bankAccountId?: string;
  // ERP-Phase 6 "Settlement Discount" — a discount the supplier offered on
  // THIS settlement (e.g. early-payment terms). Counts toward closing the
  // PO's balance the same as cash does, but posts no GL entry of its own —
  // no cash moved, and this app's GL is already a simplified cash-basis
  // approximation (recognizes COGS at payment time, no Accounts Payable
  // account exists to net a "purchase discount" against). The discount is
  // fully visible at the document level via settlementDiscountTotal/balance.
  discountAmount?: number;
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

  const discountAmount = input.discountAmount && input.discountAmount > 0 ? Math.round(input.discountAmount * 100) / 100 : 0;
  const paidAmount = Math.round((existing.paidAmount + input.amount) * 100) / 100;
  const settlementDiscountTotal = Math.round(((existing.settlementDiscountTotal ?? 0) + discountAmount) * 100) / 100;
  const balance = Math.round((existing.total - paidAmount - settlementDiscountTotal) * 100) / 100;
  const paymentStatus = balance <= 0 ? 'Paid' : paidAmount + settlementDiscountTotal > 0 ? 'Partial' : 'Unpaid';

  // Same $push + $set split as recordCustomerInvoicePayment — Mongo rejects
  // mixing a top-level $push with plain fields in one update object.
  const order = (await PurchaseOrder.findOneAndUpdate(
    { _id: poId, clientId },
    {
      $set: { paidAmount, settlementDiscountTotal, balance, paymentStatus },
      $push: {
        paymentHistory: {
          amount: input.amount,
          method: input.method,
          date: input.date ?? new Date(),
          notes: input.notes,
          chequeNumber: input.chequeNumber,
          bankAccountId: input.bankAccountId,
          discountAmount: discountAmount > 0 ? discountAmount : undefined,
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

  // ERP-Phase 3 — same Cheque-lifecycle side effect as
  // customerInvoicePayments.ts's identical block, the other direction of
  // money (we're paying the supplier, so 'outgoing').
  if (input.method === 'Cheque' && input.chequeNumber) {
    try {
      const newRecord = order.paymentHistory[order.paymentHistory.length - 1];
      await Cheque.create({
        clientId,
        chequeNumber: input.chequeNumber,
        direction: 'outgoing',
        amount: input.amount,
        bankAccountId: input.bankAccountId || undefined,
        dueDate: input.date ?? new Date(),
        sourceType: 'purchase-order-payment',
        sourceId: poId,
        paymentRecordId: newRecord._id,
        supplierId: order.supplierId,
      });
    } catch (err) {
      console.error('Cheque record creation failed for supplier payment', poId, err);
    }
  }

  return order;
}
