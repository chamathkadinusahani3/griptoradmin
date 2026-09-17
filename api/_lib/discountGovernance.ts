import { Approval } from './models/Approval.js';
import { hasPermission } from './auth.js';

export interface DiscountGateResult {
  blocked: boolean;
  /** Non-blocking — surface as a toast/banner alongside a successful creation. */
  warning?: string;
  /** Set only when blocked. */
  message?: string;
}

type Session = { sub: string; clientId: string; isOwner: boolean; roleId?: string };

/**
 * Sales Module Phase 7 — Discount Governance. Three independent triggers
 * share this file and the same block-or-warn shape already proven by
 * customerCreditLimitGate.ts's 'RequireApproval' branch: a requester who
 * already holds approvals:respond (Owner/Manager, or anyone else granted it)
 * is allowed through with a non-blocking warning (there's no one above them
 * to approve on their behalf); anyone else is hard-blocked and a
 * 'Discount Authorization' Approval doc is filed so it's already waiting on
 * the Approvals page rather than making the blocked staff member raise it by
 * hand. Deviates from the roadmap's literal mention of approvalGate.ts (that
 * helper is for the OTHER approval shape — status/approvedBy/approvedAt
 * fields living directly on a gated document, e.g. Sales Order Approve/Debit
 * Note Confirm) — this instead follows the ACTUAL working precedent already
 * shipped in this same roadmap (Phase 2's customerCreditLimitGate.ts), which
 * files a standalone Approval log entry and never blocks the same request a
 * second time once filed.
 */

interface DiscountedLine {
  name: string;
  gross: number;
  lineTotal: number;
}

/**
 * Trigger 1 — a per-line staff-entered discount (SalesOrder's
 * discount1/discount2) exceeding the tenant's configured max %. The only
 * document with a staff-controlled discount at all — Quotation/
 * CustomerInvoice.discountPct is always snapshotted from the customer's own
 * discountPct (creditDiscipline.ts), never typed in by hand — so this only
 * ever needs to be called from sales-orders/index.ts.
 */
export async function checkDiscountMagnitudeGate(
  session: Session,
  maxDiscountPct: number,
  lines: DiscountedLine[]
): Promise<DiscountGateResult> {
  if (!maxDiscountPct || maxDiscountPct <= 0) return { blocked: false };

  let worst: { name: string; pct: number } | null = null;
  for (const line of lines) {
    if (line.gross <= 0) continue;
    const pct = Math.round(((line.gross - line.lineTotal) / line.gross) * 10000) / 100;
    if (pct > maxDiscountPct && (!worst || pct > worst.pct)) worst = { name: line.name, pct };
  }
  if (!worst) return { blocked: false };

  if (await hasPermission(session, 'approvals:respond')) {
    return {
      blocked: false,
      warning: `Proceeding despite "${worst.name}"'s ${worst.pct.toFixed(1)}% discount exceeding the ${maxDiscountPct}% policy limit — recorded as an override.`,
    };
  }
  await Approval.create({
    clientId: session.clientId,
    type: 'Discount Authorization',
    subject: `Discount of ${worst.pct.toFixed(1)}% on "${worst.name}" exceeds the ${maxDiscountPct}% policy limit`,
    requestedBy: session.sub,
    status: 'Pending',
  });
  return {
    blocked: true,
    message: `"${worst.name}" has a ${worst.pct.toFixed(1)}% discount, exceeding this tenant's ${maxDiscountPct}% policy limit. A "Discount Authorization" request has been filed on the Approvals page — ask an Owner/Manager to approve it or process this order directly.`,
  };
}

interface MinPriceLine {
  name: string;
  effectiveUnitPrice: number;
  minSellingPrice: number;
}

/**
 * Trigger 2 — a resolved per-unit sell price (after any line discount and/or
 * Price List override) landing below the part's configured minSellingPrice.
 * Only meaningful for a catalog line with a real Part reference, so — same
 * structural reasoning as Phase 6's Price Lists — only SalesOrder qualifies.
 */
export async function checkMinSellingPriceGate(session: Session, lines: MinPriceLine[]): Promise<DiscountGateResult> {
  let worst: MinPriceLine | null = null;
  for (const line of lines) {
    if (line.minSellingPrice > 0 && line.effectiveUnitPrice < line.minSellingPrice) {
      if (!worst || line.minSellingPrice - line.effectiveUnitPrice > worst.minSellingPrice - worst.effectiveUnitPrice) worst = line;
    }
  }
  if (!worst) return { blocked: false };

  if (await hasPermission(session, 'approvals:respond')) {
    return {
      blocked: false,
      warning: `Proceeding despite "${worst.name}" selling at ${worst.effectiveUnitPrice.toFixed(2)}, below its minimum selling price of ${worst.minSellingPrice.toFixed(2)} — recorded as an override.`,
    };
  }
  await Approval.create({
    clientId: session.clientId,
    type: 'Discount Authorization',
    subject: `"${worst.name}" would sell at ${worst.effectiveUnitPrice.toFixed(2)}, below its minimum selling price of ${worst.minSellingPrice.toFixed(2)}`,
    requestedBy: session.sub,
    status: 'Pending',
  });
  return {
    blocked: true,
    message: `"${worst.name}" would sell at ${worst.effectiveUnitPrice.toFixed(2)}, below its minimum selling price of ${worst.minSellingPrice.toFixed(2)}. A "Discount Authorization" request has been filed on the Approvals page — ask an Owner/Manager to approve it or process this order directly.`,
  };
}

/**
 * Trigger 3 — a CustomerInvoice's total landing above a tenant-configured
 * threshold. Independent of the two line-level gates above — this checks the
 * document's grand total, so it's called once from customer-invoices/index.ts
 * after totals are computed rather than per-line.
 */
export async function checkInvoiceAmountThresholdGate(session: Session, threshold: number, total: number): Promise<DiscountGateResult> {
  if (!threshold || threshold <= 0 || total <= threshold) return { blocked: false };

  if (await hasPermission(session, 'approvals:respond')) {
    return {
      blocked: false,
      warning: `Proceeding despite this invoice's total of ${total.toFixed(2)} exceeding the ${threshold.toFixed(2)} approval threshold — recorded as an override.`,
    };
  }
  await Approval.create({
    clientId: session.clientId,
    type: 'Discount Authorization',
    subject: `Invoice total of ${total.toFixed(2)} exceeds the ${threshold.toFixed(2)} approval threshold`,
    amount: total,
    requestedBy: session.sub,
    status: 'Pending',
  });
  return {
    blocked: true,
    message: `This invoice's total of ${total.toFixed(2)} exceeds this tenant's ${threshold.toFixed(2)} approval threshold. A "Discount Authorization" request has been filed on the Approvals page — ask an Owner/Manager to approve it or process this invoice directly.`,
  };
}
