import { AdvancePayment, AdvancePaymentDoc, ADVANCE_PAYMENT_METHODS } from './models/AdvancePayment.js';
import { generateSequentialNumber } from './numbering.js';
import { postJournalEntry, getAccountIdsByNames, cashOrBankAccountName } from './journal.js';

export type AdvancePaymentMethod = (typeof ADVANCE_PAYMENT_METHODS)[number];

export interface CreateAdvancePaymentParams {
  clientId: string;
  direction: 'customer' | 'supplier';
  customerId?: string;
  supplierId?: string;
  /** Only used in the GL entry's description — not stored. */
  partyName?: string;
  amount: number;
  method: AdvancePaymentMethod;
  chequeNumber?: string;
  bankAccountId?: string;
  date: Date;
  notes?: string;
}

/**
 * Extracted from routes/advance-payments/index.ts's handleCreate so
 * recordCustomerInvoicePayment's overpayment-capture path (Dealer Credit
 * Control roadmap Module 2) can create one exactly the same way, instead of
 * a second hand-rolled copy of the AdvancePayment-plus-GL-posting logic.
 * Real cash already moved (unlike Credit/Debit Notes), so this posts its
 * own entry — Accounts Receivable/Payable pushed into a credit-balance
 * position, the same technique Receipt's on-account remainder established.
 */
export async function createAdvancePayment(params: CreateAdvancePaymentParams): Promise<AdvancePaymentDoc> {
  const { clientId, direction, customerId, supplierId, partyName, amount, method, chequeNumber, bankAccountId, date, notes } = params;

  const advancePaymentNumber = await generateSequentialNumber(AdvancePayment, clientId, 'advancePaymentNumber', 'advancePayment');
  const payment = await AdvancePayment.create({
    clientId,
    advancePaymentNumber,
    direction,
    customerId: direction === 'customer' ? customerId : undefined,
    supplierId: direction === 'supplier' ? supplierId : undefined,
    amount,
    method,
    chequeNumber: method === 'Cheque' ? chequeNumber : undefined,
    bankAccountId: bankAccountId || undefined,
    date,
    appliedAmount: 0,
    remainingAmount: amount,
    notes,
  });

  try {
    const accountName = cashOrBankAccountName(method);
    const otherAccountName = direction === 'customer' ? 'Accounts Receivable' : 'Accounts Payable';
    const accountIds = await getAccountIdsByNames(clientId, [accountName, otherAccountName]);
    const cashOrBankId = accountIds.get(accountName);
    const otherId = accountIds.get(otherAccountName);
    if (cashOrBankId && otherId) {
      await postJournalEntry({
        clientId,
        description: direction === 'customer' ? `Advance from ${partyName ?? 'customer'}` : `Advance to ${partyName ?? 'supplier'}`,
        sourceType: direction === 'customer' ? 'customer-payment' : 'supplier-payment',
        sourceId: payment._id.toString(),
        lines:
          direction === 'customer'
            ? [{ accountId: cashOrBankId, debit: amount }, { accountId: otherId, credit: amount }]
            : [{ accountId: otherId, debit: amount }, { accountId: cashOrBankId, credit: amount }],
      });
    }
  } catch (err) {
    console.error('Journal posting failed for advance payment', payment._id.toString(), err);
  }

  return payment.toObject() as AdvancePaymentDoc;
}
