import { CustomerInvoice } from './models/CustomerInvoice.js';
import { CustomerDoc } from './models/Customer.js';
import { DealerProfile } from './models/DealerProfile.js';

// Sales Module Phase 1 — Wholesale/Dealer are new B2B customer types that
// carry the same credit-relationship implications 'corporate' already did
// (gms-fleet-gated creditLimit/discountPct/creditPeriodDays). Every place
// that used to check `type === 'corporate'` for credit-discipline/exposure
// purposes now checks this array instead, so widening the `type` enum
// doesn't silently leave Wholesale/Dealer customers outside the credit
// checks their fields imply they should have. 'individual'/'retail' stay
// excluded — both are walk-in/end-consumer classifications.
export const CREDIT_ELIGIBLE_CUSTOMER_TYPES = ['corporate', 'wholesale', 'dealer'] as const;

/**
 * A corporate (dealer) customer is "in violation" if it has at least one
 * non-Void invoice with an unpaid balance older than its own
 * creditPeriodDays — keyed off invoice createdAt, not dueDate, since 2 of
 * the 3 invoice-creation paths (job-cards/[id]/invoice.ts,
 * quotations/[id]/convert.ts) never set dueDate at all. This is a distinct
 * concept from statement.ts's dueDate-based overdueAmount stat.
 */
export async function isCustomerInViolation(
  clientId: string,
  customerId: string,
  creditPeriodDays: number,
  now: Date = new Date()
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - creditPeriodDays * 24 * 60 * 60 * 1000);
  return !!(await CustomerInvoice.exists({
    clientId,
    customerId,
    status: { $ne: 'Void' },
    balance: { $gt: 0 },
    createdAt: { $lt: cutoff },
  }));
}

/**
 * The discount a fresh quotation/invoice should actually apply — 0 instead
 * of the customer's stored discountPct while they're in violation of their
 * credit period. Only ever called at the moment a discount is freshly read
 * from the live customer (original creation); edits/conversions reuse an
 * already-snapshotted discountPct by design (see call sites) and are not
 * re-checked here — retroactively pulling a discount off a document a
 * customer already agreed to would be worse than the existing one-way
 * snapshot convention.
 */
export async function getEffectiveDiscountPct(customer: CustomerDoc, clientId: string): Promise<number> {
  const stored = customer.discountPct ?? 0;
  if (stored <= 0 || !CREDIT_ELIGIBLE_CUSTOMER_TYPES.includes(customer.type as (typeof CREDIT_ELIGIBLE_CUSTOMER_TYPES)[number])) return stored;
  const violating = await isCustomerInViolation(clientId, customer._id.toString(), customer.creditPeriodDays ?? 30);
  return violating ? 0 : stored;
}

/**
 * Customer/Dealer Registration roadmap Phase 4 — don't automatically give
 * every new dealer a working credit account. True only while a dealer's own
 * DealerProfile.status is a real, explicitly-set, non-'Activated' workflow
 * state. A DealerProfile with no `status` field at all (created before this
 * phase shipped) reads back `undefined` and is treated as already usable —
 * this must never retroactively lock out a dealer that could already
 * transact yesterday. Non-dealer customers are never affected.
 */
export async function isDealerPendingApproval(clientId: string, customer: CustomerDoc): Promise<boolean> {
  if (customer.registrationType !== 'dealer') return false;
  const profile = await DealerProfile.findOne({ clientId, customerId: customer._id }).select('status').lean();
  if (!profile || profile.status === undefined) return false;
  return profile.status !== 'Activated';
}
