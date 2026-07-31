import { CustomerInvoice, CustomerInvoiceDoc } from './models/CustomerInvoice.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Single canonical "this customer's live invoice totals" query — the
 * dealer-tracking equivalent of what statement.ts and corporate-summary.ts
 * previously each computed inline (and now both call this instead).
 */
export async function getCustomerInvoicesAndTotals(clientId: string, customerId: string, now = new Date()) {
  const invoices = (await CustomerInvoice.find({ clientId, customerId, status: { $ne: 'Void' } })
    .sort({ createdAt: -1 })
    .lean()) as CustomerInvoiceDoc[];

  let totalOutstanding = 0;
  let overdueAmount = 0;
  for (const inv of invoices) {
    totalOutstanding += inv.balance;
    if (inv.dueDate && new Date(inv.dueDate) < now && inv.balance > 0) {
      overdueAmount += inv.balance;
    }
  }
  return { invoices, totalOutstanding: round2(totalOutstanding), overdueAmount: round2(overdueAmount) };
}

export interface DealerMetrics {
  avgDaysToPay: number | null;
  onTimePaymentRatePct: number | null;
  lastPurchaseDate: Date | null;
  purchasesLast90Days: number;
  purchasesPrior90Days: number;
  purchaseTrend: 'up' | 'down' | 'flat';
  isInViolation: boolean;
  daysPastCreditPeriod: number;
  creditUtilizationPct: number | null;
}

/** Days between an invoice's creation and the payment that brought its cumulative paid total to (or past) `total` — null if never fully paid. */
function daysToFullyPaid(inv: CustomerInvoiceDoc): number | null {
  if (inv.paymentStatus !== 'Paid' || !inv.paymentHistory?.length) return null;
  const sorted = [...inv.paymentHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let cumulative = 0;
  for (const p of sorted) {
    cumulative += p.amount;
    if (cumulative >= inv.total - 0.01) {
      return Math.max(0, Math.round((new Date(p.date).getTime() - new Date(inv.createdAt as unknown as string).getTime()) / DAY_MS));
    }
  }
  return null;
}

/** Pure function over an already-fetched invoice array — no extra DB round-trip. Reused by statement.ts, corporate-summary.ts, and the cron's Saturday dealer report. */
export function computeDealerMetrics(
  invoices: CustomerInvoiceDoc[],
  creditLimit: number,
  totalOutstanding: number,
  creditPeriodDays: number,
  now: Date = new Date()
): DealerMetrics {
  const paidDaysList = invoices.map(daysToFullyPaid).filter((d): d is number => d !== null);
  const avgDaysToPay = paidDaysList.length > 0 ? Math.round(paidDaysList.reduce((a, b) => a + b, 0) / paidDaysList.length) : null;
  const onTimePaymentRatePct =
    paidDaysList.length > 0
      ? Math.round((paidDaysList.filter((d) => d <= creditPeriodDays).length / paidDaysList.length) * 100)
      : null;

  const lastPurchaseDate = invoices.length > 0 ? new Date(Math.max(...invoices.map((i) => new Date(i.createdAt as unknown as string).getTime()))) : null;

  const last90Cutoff = new Date(now.getTime() - 90 * DAY_MS);
  const prior90Cutoff = new Date(now.getTime() - 180 * DAY_MS);
  let purchasesLast90Days = 0;
  let purchasesPrior90Days = 0;
  for (const inv of invoices) {
    const created = new Date(inv.createdAt as unknown as string);
    if (created >= last90Cutoff && created <= now) purchasesLast90Days++;
    else if (created >= prior90Cutoff && created < last90Cutoff) purchasesPrior90Days++;
  }
  const purchaseTrend: DealerMetrics['purchaseTrend'] =
    purchasesLast90Days > purchasesPrior90Days ? 'up' : purchasesLast90Days < purchasesPrior90Days ? 'down' : 'flat';

  let daysPastCreditPeriod = 0;
  for (const inv of invoices) {
    if (inv.balance <= 0) continue;
    const daysOld = Math.floor((now.getTime() - new Date(inv.createdAt as unknown as string).getTime()) / DAY_MS);
    const over = daysOld - creditPeriodDays;
    if (over > daysPastCreditPeriod) daysPastCreditPeriod = over;
  }
  const isInViolation = daysPastCreditPeriod > 0;

  const creditUtilizationPct = creditLimit > 0 ? Math.round((totalOutstanding / creditLimit) * 100) : null;

  return {
    avgDaysToPay,
    onTimePaymentRatePct,
    lastPurchaseDate,
    purchasesLast90Days,
    purchasesPrior90Days,
    purchaseTrend,
    isInViolation,
    daysPastCreditPeriod,
    creditUtilizationPct,
  };
}
