import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Customer, CustomerDoc } from '../_lib/models/Customer';
import { CustomerInvoice, CustomerInvoiceDoc } from '../_lib/models/CustomerInvoice';
import { requireTenant } from '../_lib/auth';
import { serializeCustomer } from '../_lib/serializers';
import { hasAddOn } from '../_lib/entitlements';

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

  const session = requireTenant(req, res);
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
  const totalsByCustomerId = new Map<string, { totalOutstanding: number; overdueAmount: number }>();
  for (const inv of invoices) {
    const key = inv.customerId.toString();
    const totals = totalsByCustomerId.get(key) ?? { totalOutstanding: 0, overdueAmount: 0 };
    totals.totalOutstanding += inv.balance;
    if (inv.dueDate && new Date(inv.dueDate) < now && inv.balance > 0) {
      totals.overdueAmount += inv.balance;
    }
    totalsByCustomerId.set(key, totals);
  }

  return res.status(200).json({
    accounts: customers.map((customer) => {
      const totals = totalsByCustomerId.get(customer._id.toString()) ?? { totalOutstanding: 0, overdueAmount: 0 };
      const creditLimit = customer.creditLimit ?? 0;
      const totalOutstanding = Math.round(totals.totalOutstanding * 100) / 100;
      return {
        ...serializeCustomer(customer),
        totalOutstanding,
        overdueAmount: Math.round(totals.overdueAmount * 100) / 100,
        creditAvailable: creditLimit > 0 ? Math.round((creditLimit - totalOutstanding) * 100) / 100 : null,
      };
    }),
  });
}
