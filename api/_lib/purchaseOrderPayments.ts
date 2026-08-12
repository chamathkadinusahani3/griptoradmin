import { PurchaseOrder, PurchaseOrderDoc } from './models/PurchaseOrder.js';

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
  if (!existing || (existing.status !== 'Ordered' && existing.status !== 'Received')) return null;

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

  return order;
}
