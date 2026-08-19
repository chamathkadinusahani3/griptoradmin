import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { bucketAge, daysBetween, AgingBucket } from '../../aging.js';

const BUCKETS: AgingBucket[] = ['Current', '1-30', '31-60', '61-90', '90+'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  await connectToDatabase();

  const now = new Date();
  const [invoices, customers] = await Promise.all([
    CustomerInvoice.find({ clientId: session.clientId, status: { $ne: 'Void' }, balance: { $gt: 0 } }).lean() as Promise<CustomerInvoiceDoc[]>,
    Customer.find({ clientId: session.clientId }).select('name').lean() as Promise<CustomerDoc[]>,
  ]);
  const customerNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));

  const byBucket: Record<AgingBucket, { count: number; amount: number }> = {
    Current: { count: 0, amount: 0 },
    '1-30': { count: 0, amount: 0 },
    '31-60': { count: 0, amount: 0 },
    '61-90': { count: 0, amount: 0 },
    '90+': { count: 0, amount: 0 },
  };
  const byCustomer = new Map<string, { name: string; outstanding: number; oldestBucket: AgingBucket }>();

  for (const inv of invoices) {
    // Same fallback as accounting-report.ts's overdueAmount logic, extended
    // to a full aging bucket instead of a single overdue/not-overdue split
    // — reference date is dueDate when set, otherwise the invoice date
    // itself (standard aging convention when no explicit terms exist).
    const referenceDate = inv.dueDate ?? (inv as unknown as { createdAt: Date }).createdAt;
    const bucket = bucketAge(daysBetween(referenceDate, now));
    byBucket[bucket].count += 1;
    byBucket[bucket].amount += inv.balance;

    const key = inv.customerId.toString();
    const entry = byCustomer.get(key) ?? { name: customerNameById.get(key) ?? 'Unknown customer', outstanding: 0, oldestBucket: 'Current' as AgingBucket };
    entry.outstanding += inv.balance;
    if (BUCKETS.indexOf(bucket) > BUCKETS.indexOf(entry.oldestBucket)) entry.oldestBucket = bucket;
    byCustomer.set(key, entry);
  }

  const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.balance, 0);

  return res.status(200).json({
    asOf: now,
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    byBucket: BUCKETS.map((bucket) => ({ bucket, count: byBucket[bucket].count, amount: Math.round(byBucket[bucket].amount * 100) / 100 })),
    customers: Array.from(byCustomer.entries())
      .map(([id, v]) => ({ id, name: v.name, outstanding: Math.round(v.outstanding * 100) / 100, oldestBucket: v.oldestBucket }))
      .sort((a, b) => b.outstanding - a.outstanding),
  });
}
