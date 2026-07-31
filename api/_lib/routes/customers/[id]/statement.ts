import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Customer, CustomerDoc } from '../../../models/Customer.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../../models/CustomerInvoice.js';
import { requireTenantPermission } from '../../../auth.js';
import { serializeCustomerInvoice } from '../../../serializers.js';
import { computeDealerMetrics } from '../../../dealerMetrics.js';

// Everything here is computed live from real CustomerInvoice documents on
// every call — never stored redundantly. This is the direct fix for the
// Anura reference's FleetAccount.balance/overdueAmount, which are written
// once at 0 on creation and never updated by any job card/invoice/booking
// anywhere in that codebase. Computing live means it's structurally
// impossible for this to go stale the same way.
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

  const invoices = (await CustomerInvoice.find({
    clientId: session.clientId,
    customerId: id,
    status: { $ne: 'Void' },
  })
    .sort({ createdAt: -1 })
    .lean()) as CustomerInvoiceDoc[];

  const now = new Date();
  let totalInvoiced = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;
  let overdueAmount = 0;
  for (const inv of invoices) {
    totalInvoiced += inv.total;
    totalPaid += inv.paidAmount;
    totalOutstanding += inv.balance;
    if (inv.dueDate && new Date(inv.dueDate) < now && inv.balance > 0) {
      overdueAmount += inv.balance;
    }
  }

  const creditLimit = customer.creditLimit ?? 0;
  const roundedOutstanding = Math.round(totalOutstanding * 100) / 100;

  const dealerMetrics =
    customer.type === 'corporate'
      ? computeDealerMetrics(invoices, creditLimit, roundedOutstanding, customer.creditPeriodDays ?? 30)
      : null;

  return res.status(200).json({
    creditLimit,
    creditAvailable: creditLimit > 0 ? Math.round((creditLimit - totalOutstanding) * 100) / 100 : null,
    totalInvoiced: Math.round(totalInvoiced * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalOutstanding: roundedOutstanding,
    overdueAmount: Math.round(overdueAmount * 100) / 100,
    invoices: invoices.map((inv) => serializeCustomerInvoice(inv, customer.name)),
    ...(dealerMetrics ?? {}),
  });
}
