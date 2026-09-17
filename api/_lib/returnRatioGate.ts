import { CustomerDoc } from './models/Customer.js';
import { Approval } from './models/Approval.js';
import { getCustomerInvoicesAndTotals, computeDealerMetrics, getCustomerReturnedAmount } from './dealerMetrics.js';
import { CREDIT_ELIGIBLE_CUSTOMER_TYPES } from './creditDiscipline.js';

export type ReturnRatioPolicy = 'Off' | 'Block' | 'Warn' | 'RequireApproval';

export interface ReturnRatioGateResult {
  blocked: boolean;
  /** Non-blocking — surface as a toast/banner alongside a successful creation. */
  warning?: string;
  /** Set only when blocked. */
  message?: string;
}

/**
 * Dealer Credit Control roadmap Module 1 — blocks generating a
 * CustomerInvoice for a dealer whose return ratio (returned value / total
 * invoiced, see dealerMetrics.ts's computeDealerMetrics) exceeds this
 * tenant's configured threshold. Deliberately its OWN independent check
 * from customerCreditLimitGate.ts (a different number, a different kind of
 * risk) — both can fire on the same invoice creation without conflicting,
 * same "each check is independent, any one blocking is enough" reasoning
 * that file's own comment documents. Call this alongside, not instead of,
 * that gate.
 *
 * Scoped to CREDIT_ELIGIBLE_CUSTOMER_TYPES only, same as the credit-limit
 * gate, and only once the dealer has actually been invoiced anything (a
 * zero-denominator ratio is meaningless, not a violation).
 *
 * Policy meanings mirror customerCreditLimitGate.ts's, with one deliberate
 * difference: RequireApproval's override is gated to session.isOwner
 * specifically, not the broader approvals:respond permission group — the
 * spec calls the unblock action "Director Approval," and this app's single
 * top-level-authority flag (isOwner) is the closest fit, not "any Manager."
 */
export async function checkReturnRatioGate(
  session: { sub: string; clientId: string; isOwner: boolean },
  policy: ReturnRatioPolicy,
  thresholdPct: number,
  customer: CustomerDoc
): Promise<ReturnRatioGateResult> {
  if (policy === 'Off') return { blocked: false };
  if (!CREDIT_ELIGIBLE_CUSTOMER_TYPES.includes(customer.type as (typeof CREDIT_ELIGIBLE_CUSTOMER_TYPES)[number])) return { blocked: false };

  const { invoices } = await getCustomerInvoicesAndTotals(session.clientId, customer._id.toString());
  if (invoices.length === 0) return { blocked: false };

  const returnedAmount = await getCustomerReturnedAmount(session.clientId, invoices.map((i) => i._id.toString()));
  const metrics = computeDealerMetrics(invoices, customer.creditLimit ?? 0, 0, customer.creditPeriodDays ?? 30, new Date(), returnedAmount);
  const ratio = metrics.returnRatioPct;
  if (ratio == null || ratio <= thresholdPct) return { blocked: false };

  if (policy === 'Warn') {
    return {
      blocked: false,
      warning: `${customer.name}'s return ratio is ${ratio}%, exceeding this tenant's ${thresholdPct}% threshold.`,
    };
  }

  if (policy === 'RequireApproval') {
    if (session.isOwner) {
      return {
        blocked: false,
        warning: `Proceeding despite ${customer.name}'s ${ratio}% return ratio exceeding the ${thresholdPct}% threshold — recorded as a Director override.`,
      };
    }
    await Approval.create({
      clientId: session.clientId,
      type: 'Return Ratio Override',
      subject: `${customer.name} — return ratio ${ratio}% exceeds the ${thresholdPct}% threshold`,
      requestedBy: session.sub,
      status: 'Pending',
    });
    return {
      blocked: true,
      message: `${customer.name}'s return ratio (${ratio}%) exceeds this tenant's ${thresholdPct}% threshold. A "Return Ratio Override" request has been filed on the Approvals page — ask an Owner to approve it or generate this invoice directly.`,
    };
  }

  // policy === 'Block' — no override path, not even for an Owner.
  return {
    blocked: true,
    message: `${customer.name}'s return ratio (${ratio}%) exceeds this tenant's ${thresholdPct}% threshold. This tenant's policy blocks invoicing this dealer with no override.`,
  };
}
