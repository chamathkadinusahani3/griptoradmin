import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Customer, CustomerDoc } from '../../../models/Customer.js';
import { SalesOrder } from '../../../models/SalesOrder.js';
import { Cheque } from '../../../models/Cheque.js';
import { requireTenantPermission } from '../../../auth.js';
import { getCustomerInvoicesAndTotals, computeDealerMetrics, getReturnedAmountsByInvoiceId } from '../../../dealerMetrics.js';

// Customer/Dealer Registration roadmap Phase 3 — everything here is
// computed live from real transaction data on every call, never stored on
// DealerProfile, per the user's own explicit "don't make these manually
// entered... your ERP should calculate them" instruction. Reuses
// dealerMetrics.ts's existing computation for credit utilization/return
// ratio/on-time payment rate rather than re-deriving them; only the counts
// and monthly-sales figures below are genuinely new aggregations.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'customers:view');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing customer id' });

  await connectToDatabase();

  const customer = (await Customer.findOne({ _id: id, clientId: session.clientId }).lean()) as CustomerDoc | null;
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const now = new Date();
  const { invoices, totalOutstanding, overdueAmount } = await getCustomerInvoicesAndTotals(session.clientId, id, now);
  const returnedAmountByInvoiceId = await getReturnedAmountsByInvoiceId(session.clientId, invoices.map((i) => i._id.toString()));
  const returnedAmount = [...returnedAmountByInvoiceId.values()].reduce((sum, v) => sum + v, 0);
  const metrics = computeDealerMetrics(invoices, customer.creditLimit, totalOutstanding, customer.creditPeriodDays, now, returnedAmount);

  const totalSales = invoices.reduce((sum, inv) => sum + inv.total, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const salesThisMonth = invoices
    .filter((inv) => new Date(inv.createdAt as unknown as string) >= monthStart)
    .reduce((sum, inv) => sum + inv.total, 0);
  const salesThisYear = invoices
    .filter((inv) => new Date(inv.createdAt as unknown as string) >= yearStart)
    .reduce((sum, inv) => sum + inv.total, 0);

  const firstInvoiceDate = invoices.length > 0
    ? new Date(Math.min(...invoices.map((i) => new Date(i.createdAt as unknown as string).getTime())))
    : null;
  const monthsActive = firstInvoiceDate
    ? Math.max(1, Math.round((now.getTime() - firstInvoiceDate.getTime()) / (30 * 24 * 60 * 60 * 1000)))
    : 1;
  const averageMonthlySales = totalSales / monthsActive;

  const [salesOrderCount, chequeReturnsCount] = await Promise.all([
    SalesOrder.countDocuments({ clientId: session.clientId, customerId: id, status: { $ne: 'Cancelled' } }),
    Cheque.countDocuments({ clientId: session.clientId, customerId: id, direction: 'incoming', status: 'Returned' }),
  ]);

  return res.status(200).json({
    totalSales: Math.round(totalSales * 100) / 100,
    salesThisMonth: Math.round(salesThisMonth * 100) / 100,
    salesThisYear: Math.round(salesThisYear * 100) / 100,
    averageMonthlySales: Math.round(averageMonthlySales * 100) / 100,
    totalOutstanding,
    overdueAmount,
    creditUtilizationPct: metrics.creditUtilizationPct,
    returnRatioPct: metrics.returnRatioPct,
    onTimePaymentRatePct: metrics.onTimePaymentRatePct,
    returnedValue: returnedAmount,
    salesOrderCount,
    invoiceCount: invoices.length,
    returnedInvoiceCount: returnedAmountByInvoiceId.size,
    chequeReturnsCount,
    // Structural gaps, flagged explicitly rather than silently faked as 0:
    // CreditNote has no customerId at all (only reachable via Return ->
    // Sale — a POS-style sale, not the B2B invoiced pipeline dealers use);
    // DebitNote today is exclusively the supplier-direction mirror of
    // CreditNote (see DebitNote.ts) — a customer-direction Debit Note
    // doesn't exist in this codebase yet (tracked as a Sales Module roadmap
    // gap). Both are `null`, not 0 — the frontend renders "not available".
    creditNotesCount: null,
    debitNotesCount: null,
  });
}
