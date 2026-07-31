import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeCustomer } from '../../serializers.js';
import { hasAddOn } from '../../entitlements.js';
import { computeDealerMetrics } from '../../dealerMetrics.js';

// Bulk equivalent of api/customers/[id]/statement.ts — same live
// CustomerInvoice aggregation, computed live on every call, but grouped
// across every corporate customer in one batched query instead of one
// customer at a time. Powers the Corporate Accounts overview page, which has
// no prior single-customer entry point.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'customers:view');
  if (!session) return;

  await connectToDatabase();

  // Corporate accounts require gms-fleet, same gate as creating/editing one
  // (api/customers/index.ts). No add-on means no corporate customers could
  // have been created in the first place — return an empty list rather than
  // erroring, so the frontend can show its own upsell state.
  if (!(await hasAddOn(session.clientId, 'gms-fleet'))) {
    return res.status(200).json({ accounts: [] });
  }

  const customers = (await Customer.find({ clientId: session.clientId, type: 'corporate' })
    .sort({ name: 1 })
    .lean()) as CustomerDoc[];

  if (customers.length === 0) {
    return res.status(200).json({ accounts: [] });
  }

  const customerIds = customers.map((c) => c._id);
  const invoices = (await CustomerInvoice.find({
    clientId: session.clientId,
    customerId: { $in: customerIds },
    status: { $ne: 'Void' },
  }).lean()) as CustomerInvoiceDoc[];

  const now = new Date();
  const invoicesByCustomerId = new Map<string, CustomerInvoiceDoc[]>();
  for (const inv of invoices) {
    const key = inv.customerId.toString();
    const list = invoicesByCustomerId.get(key) ?? [];
    list.push(inv);
    invoicesByCustomerId.set(key, list);
  }

  return res.status(200).json({
    accounts: customers.map((customer) => {
      const customerInvoices = invoicesByCustomerId.get(customer._id.toString()) ?? [];
      let totalOutstanding = 0;
      let overdueAmount = 0;
      for (const inv of customerInvoices) {
        totalOutstanding += inv.balance;
        if (inv.dueDate && new Date(inv.dueDate) < now && inv.balance > 0) overdueAmount += inv.balance;
      }
      totalOutstanding = Math.round(totalOutstanding * 100) / 100;
      const creditLimit = customer.creditLimit ?? 0;
      const dealerMetrics = computeDealerMetrics(customerInvoices, creditLimit, totalOutstanding, customer.creditPeriodDays ?? 30, now);
      return {
        ...serializeCustomer(customer),
        totalOutstanding,
        overdueAmount: Math.round(overdueAmount * 100) / 100,
        creditAvailable: creditLimit > 0 ? Math.round((creditLimit - totalOutstanding) * 100) / 100 : null,
        ...dealerMetrics,
      };
    }),
  });
}
