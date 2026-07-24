import { Customer } from './models/Customer';
import { LoyaltyTransaction } from './models/LoyaltyTransaction';

// Matches Anura's own real (if hardcoded) conversion rate — 1 point per
// currency unit spent per 1000. Not tenant-configurable in this phase, same
// call already made for accounting.ts's TAX_RATE.
export const POINTS_PER_CURRENCY_UNIT = 1 / 1000;

/** Awards points for a paid invoice and logs the ledger entry. Fire-and-forget from the caller's perspective — not itself transactional with the payment write, same as every other "bump a derived stat" side effect in this app (e.g. Customer.visits on job completion). */
export async function awardPoints(clientId: string, customerId: string, amountPaid: number, invoiceId: string): Promise<void> {
  const points = Math.floor(amountPaid * POINTS_PER_CURRENCY_UNIT);
  if (points <= 0) return;
  await Customer.updateOne({ _id: customerId, clientId }, { $inc: { loyaltyPoints: points } });
  await LoyaltyTransaction.create({ clientId, customerId, points, reason: 'Invoice payment', invoiceId });
}
