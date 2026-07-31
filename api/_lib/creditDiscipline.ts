import { CustomerInvoice } from './models/CustomerInvoice.js';
import { CustomerDoc } from './models/Customer.js';

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
  if (stored <= 0 || customer.type !== 'corporate') return stored;
  const violating = await isCustomerInViolation(clientId, customer._id.toString(), customer.creditPeriodDays ?? 30);
  return violating ? 0 : stored;
}
