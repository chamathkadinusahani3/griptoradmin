import { CustomerInvoice, CustomerInvoiceDoc } from './models/CustomerInvoice.js';
import { Cheque } from './models/Cheque.js';
import { Customer, CustomerDoc } from './models/Customer.js';
import { hasAddOn } from './entitlements.js';
import { awardPoints } from './loyalty.js';
import { postJournalEntry, getAccountIdsByNames, cashOrBankAccountName } from './journal.js';
import { createAdvancePayment, AdvancePaymentMethod } from './advancePayments.js';

export interface RecordPaymentInput {
  amount: number;
  method: 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Other' | 'PayHere';
  date?: Date;
  notes?: string;
  payherePaymentId?: string;
  chequeNumber?: string;
  bankAccountId?: string;
}

/**
 * The single source of truth for turning a payment into a real
 * paidAmount/balance/paymentStatus update — used by both the staff
 * manual-entry endpoint (api/customer-invoices/[id]/payment.ts) and the
 * PayHere notify callback, so the money math can never diverge between the
 * two entry points (CustomerInvoice.ts's own schema comment: "Always
 * server-computed").
 *
 * Returns null if the invoice doesn't exist in this tenant, or is Void.
 */
export async function recordCustomerInvoicePayment(
  invoiceId: string,
  clientId: string,
  input: RecordPaymentInput
): Promise<CustomerInvoiceDoc | null> {
  const existing = (await CustomerInvoice.findOne({ _id: invoiceId, clientId }).lean()) as CustomerInvoiceDoc | null;
  if (!existing || existing.status === 'Void') return null;

  // Dealer Credit Control roadmap Module 2 — cap what actually applies to
  // THIS invoice at its outstanding balance, so balance can never go
  // negative. Any excess is money that really moved (unlike a Credit Note,
  // which piggybacks on a prior GL event) and is captured as its own
  // AdvancePayment for the customer instead — a reusable credit against a
  // FUTURE invoice, via Utilization — rather than silently absorbed into a
  // negative balance field nothing else in this app expects.
  const outstanding = Math.max(0, Math.round((existing.total - existing.paidAmount) * 100) / 100);
  const appliedAmount = Math.min(input.amount, outstanding);
  const overpaymentAmount = Math.round((input.amount - appliedAmount) * 100) / 100;

  const paidAmount = Math.round((existing.paidAmount + appliedAmount) * 100) / 100;
  const balance = Math.round((existing.total - paidAmount) * 100) / 100;
  const paymentStatus = balance <= 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';

  // Mongo rejects an update object that mixes a top-level $push with plain
  // (non-$) fields — wrap the plain fields in $set too (same gotcha hit
  // during the original Support Tickets work).
  const invoice = (await CustomerInvoice.findOneAndUpdate(
    { _id: invoiceId, clientId },
    {
      $set: {
        paidAmount,
        balance,
        paymentStatus,
        status: paymentStatus === 'Paid' ? 'Paid' : existing.status,
      },
      $push: {
        paymentHistory: {
          amount: appliedAmount,
          method: input.method,
          date: input.date ?? new Date(),
          notes: input.notes,
          payherePaymentId: input.payherePaymentId,
          chequeNumber: input.chequeNumber,
          bankAccountId: input.bankAccountId,
        },
      },
    },
    { returnDocument: 'after' }
  ).lean()) as CustomerInvoiceDoc;

  // Best-effort, outside any transaction (this function has none of its
  // own) — a broken journal posting must never take down the payment
  // record itself, which is the actual money-received fact of record.
  // Recognizes revenue at PAYMENT time (not at invoice-issue time, which
  // this codebase doesn't hook into for GL purposes), so this credits
  // Service Revenue directly rather than Accounts Receivable.
  try {
    if (appliedAmount > 0) {
      const accountIds = await getAccountIdsByNames(clientId, [cashOrBankAccountName(input.method), 'Service Revenue']);
      const cashOrBankId = accountIds.get(cashOrBankAccountName(input.method));
      const revenueId = accountIds.get('Service Revenue');
      if (cashOrBankId && revenueId) {
        await postJournalEntry({
          clientId,
          description: `Invoice payment — ${invoice.invoiceNumber}`,
          sourceType: 'customer-payment',
          sourceId: invoiceId,
          lines: [{ accountId: cashOrBankId, debit: appliedAmount }, { accountId: revenueId, credit: appliedAmount }],
        });
      }
    }
  } catch (err) {
    console.error('Journal posting failed for customer payment', invoiceId, err);
  }

  // Dealer Credit Control roadmap Module 2 — the portion that couldn't
  // apply to this invoice becomes its own AdvancePayment, with its own real
  // GL entry (createAdvancePayment posts Accounts Receivable, not Service
  // Revenue — this isn't recognized revenue yet, just cash held on
  // account). Best-effort, same non-blocking reasoning as every other
  // GL-posting side effect in this function.
  if (overpaymentAmount > 0) {
    try {
      const customer = (await Customer.findById(invoice.customerId).select('name').lean()) as CustomerDoc | null;
      await createAdvancePayment({
        clientId,
        direction: 'customer',
        customerId: invoice.customerId.toString(),
        partyName: customer?.name,
        amount: overpaymentAmount,
        method: (input.method === 'PayHere' ? 'Other' : input.method) as AdvancePaymentMethod,
        chequeNumber: input.chequeNumber,
        bankAccountId: input.bankAccountId,
        date: input.date ?? new Date(),
        notes: `Overpayment on invoice ${invoice.invoiceNumber}`,
      });
    } catch (err) {
      console.error('Overpayment AdvancePayment creation failed for customer payment', invoiceId, err);
    }
  }

  // ERP-Phase 3: a Cheque-method payment gets a real lifecycle record, not
  // just the plain paymentHistory.chequeNumber string. Best-effort, same
  // non-blocking reasoning as the journal posting above — a garage's
  // payment record is the fact of record; Cheque tracking is a convenience
  // layered on top of it, never allowed to block it.
  if (input.method === 'Cheque' && input.chequeNumber) {
    try {
      const newRecord = invoice.paymentHistory[invoice.paymentHistory.length - 1];
      await Cheque.create({
        clientId,
        chequeNumber: input.chequeNumber,
        direction: 'incoming',
        amount: input.amount,
        bankAccountId: input.bankAccountId || undefined,
        dueDate: input.date ?? new Date(),
        sourceType: 'customer-invoice-payment',
        sourceId: invoiceId,
        paymentRecordId: newRecord._id,
        customerId: invoice.customerId,
      });
    } catch (err) {
      console.error('Cheque record creation failed for customer payment', invoiceId, err);
    }
  }

  // Award loyalty points exactly once — only on the transition INTO 'Paid',
  // never on a re-save of an already-paid invoice (the same
  // "just transitioned" guard used for Customer.visits on job completion
  // and startedAt/completedAt on job cards).
  const justPaid = existing.paymentStatus !== 'Paid' && paymentStatus === 'Paid';
  if (justPaid && (await hasAddOn(clientId, 'crm-loyalty'))) {
    await awardPoints(clientId, invoice.customerId.toString(), invoice.total, invoice._id.toString());
  }

  return invoice;
}

/** True if this PayHere payment id has already been recorded on this invoice — notify-callback idempotency guard against PayHere's at-least-once delivery. */
export async function hasGatewayPaymentBeenRecorded(invoiceId: string, clientId: string, gatewayPaymentId: string): Promise<boolean> {
  const existing = (await CustomerInvoice.findOne({
    _id: invoiceId,
    clientId,
    'paymentHistory.payherePaymentId': gatewayPaymentId,
  }).lean()) as CustomerInvoiceDoc | null;
  return !!existing;
}
