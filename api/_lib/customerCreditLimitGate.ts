import { CustomerDoc } from './models/Customer.js';
import { Approval } from './models/Approval.js';
import { getCustomerInvoicesAndTotals } from './dealerMetrics.js';
import { CREDIT_ELIGIBLE_CUSTOMER_TYPES } from './creditDiscipline.js';
import { hasPermission } from './auth.js';

export type CustomerCreditLimitPolicy = 'Off' | 'Block' | 'Warn' | 'RequireApproval';

export interface CreditLimitGateResult {
  blocked: boolean;
  /** Non-blocking — surface as a toast/banner alongside a successful creation. */
  warning?: string;
  /** Set only when blocked. */
  message?: string;
}

/**
 * Sales Module Phase 2 — a tenant-wide hard cap on a CUSTOMER's own total
 * outstanding balance vs their own Customer.creditLimit. Deliberately a
 * DIFFERENT mechanism from the two that already existed before this phase:
 *  - salesExecCredit.ts's checkCreditExposureLimit() caps a STAFF member's
 *    own personal exposure (User.creditLimit), only when their Role has
 *    requiresCreditLimit — this gate applies regardless of who's selling.
 *  - creditDiscipline.ts's getEffectiveDiscountPct() never blocks anything,
 *    it only zeroes a forfeited discount.
 * All three can run independently in the same request without conflicting —
 * each is its own independent check against a different number, and any one
 * of them blocking is sufficient to reject the request. Call this AFTER
 * checkCreditExposureLimit() in every creation route so the existing staff-
 * exposure message/behavior is completely unchanged when that one already
 * blocks.
 *
 * Scoped to CREDIT_ELIGIBLE_CUSTOMER_TYPES only (same as the two existing
 * checks) and only when the customer actually has a configured creditLimit >
 * 0 — an eligible customer with no limit set is treated as uncapped, same
 * "0 means unconfigured" convention used elsewhere (e.g. statement.ts's
 * creditAvailable).
 *
 * Policy meanings:
 *  - 'Off' (default): no-op, zero behavior change.
 *  - 'Block': hard stop for everyone, no override path — the strictest mode.
 *  - 'Warn': never blocks; returns a warning message for the caller to
 *    surface non-fatally alongside the successful creation.
 *  - 'RequireApproval': blocks non-approvers (auto-filing a 'Credit Limit
 *    Override' Approval doc so it's waiting on the Approvals page already,
 *    rather than making the blocked staff member go raise it by hand);
 *    anyone holding approvals:respond (the actual approval authority) can
 *    push the sale through directly instead — there's no one above an
 *    Owner/Manager to approve a request on their behalf.
 */
export async function checkCustomerCreditLimitGate(
  session: { sub: string; clientId: string; isOwner: boolean; roleId?: string },
  policy: CustomerCreditLimitPolicy,
  customer: CustomerDoc,
  prospectiveNewTotal: number
): Promise<CreditLimitGateResult> {
  if (policy === 'Off') return { blocked: false };
  if (!CREDIT_ELIGIBLE_CUSTOMER_TYPES.includes(customer.type as (typeof CREDIT_ELIGIBLE_CUSTOMER_TYPES)[number])) return { blocked: false };

  const limit = customer.creditLimit ?? 0;
  if (limit <= 0) return { blocked: false };

  const { totalOutstanding } = await getCustomerInvoicesAndTotals(session.clientId, customer._id.toString());
  const prospective = Math.round((totalOutstanding + prospectiveNewTotal) * 100) / 100;
  if (prospective <= limit) return { blocked: false };

  const overBy = Math.round((prospective - limit) * 100) / 100;

  if (policy === 'Warn') {
    return {
      blocked: false,
      warning: `${customer.name}'s outstanding balance would reach ${prospective.toFixed(2)}, exceeding their credit limit of ${limit.toFixed(2)} by ${overBy.toFixed(2)}.`,
    };
  }

  if (policy === 'RequireApproval') {
    if (await hasPermission(session, 'approvals:respond')) {
      return {
        blocked: false,
        warning: `Proceeding despite exceeding ${customer.name}'s credit limit by ${overBy.toFixed(2)} — recorded as an override.`,
      };
    }
    await Approval.create({
      clientId: session.clientId,
      type: 'Credit Limit Override',
      subject: `${customer.name} — outstanding would reach ${prospective.toFixed(2)}, exceeding their ${limit.toFixed(2)} credit limit`,
      amount: prospective,
      requestedBy: session.sub,
      status: 'Pending',
    });
    return {
      blocked: true,
      message: `This would bring ${customer.name}'s outstanding balance to ${prospective.toFixed(2)}, exceeding their credit limit of ${limit.toFixed(2)}. A "Credit Limit Override" request has been filed on the Approvals page — ask an Owner/Manager to approve it or process this sale directly.`,
    };
  }

  // policy === 'Block' — no override path, not even for an Owner/Manager.
  return {
    blocked: true,
    message: `This would bring ${customer.name}'s outstanding balance to ${prospective.toFixed(2)}, exceeding their credit limit of ${limit.toFixed(2)}. This tenant's policy blocks sales beyond a customer's credit limit with no override.`,
  };
}
