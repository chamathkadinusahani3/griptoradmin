import { User } from './models/User.js';
import { CustomerDoc } from './models/Customer.js';
import { getCustomerInvoicesAndTotals } from './dealerMetrics.js';

/**
 * Enforces a staff member's own personal credit-exposure cap on corporate
 * (dealer) customers — a no-op unless their Role has requiresCreditLimit
 * (api/_lib/models/Role.ts; originally hardcoded to the 'Sales Executive'
 * role name, now any role can opt into this behavior). Deliberately
 * fail-closed: requiresCreditLimit with no creditLimit configured is
 * blocked from every corporate sale until an Owner/Manager sets one,
 * matching the feature's "minimise financial risk" intent.
 */
export async function checkCreditExposureLimit(
  session: { sub: string; clientId: string; requiresCreditLimit: boolean },
  customer: CustomerDoc,
  prospectiveNewTotal: number
): Promise<{ blocked: boolean; message?: string }> {
  if (!session.requiresCreditLimit) return { blocked: false };
  if (customer.type !== 'corporate') return { blocked: false };

  const user = (await User.findById(session.sub).select('creditLimit').lean()) as { creditLimit?: number } | null;
  const limit = user?.creditLimit ?? 0;

  if (limit <= 0) {
    return {
      blocked: true,
      message: 'Your credit limit has not been configured yet — ask an Owner/Manager to set one before selling to corporate customers.',
    };
  }

  const { totalOutstanding } = await getCustomerInvoicesAndTotals(session.clientId, customer._id.toString());
  const prospective = Math.round((totalOutstanding + prospectiveNewTotal) * 100) / 100;

  if (prospective > limit) {
    return {
      blocked: true,
      message: `This would bring ${customer.name}'s outstanding balance to ${prospective.toFixed(2)}, exceeding your credit limit of ${limit.toFixed(2)}. Raise a "Credit Limit Override" request from the Approvals page, or ask an Owner/Manager to process this sale.`,
    };
  }

  return { blocked: false };
}
