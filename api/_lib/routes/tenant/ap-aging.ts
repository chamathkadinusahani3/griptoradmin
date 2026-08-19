import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../models/PurchaseOrder.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
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
  // Ordered/Partially Received/Received POs are all real payables — a
  // Draft or Cancelled PO was never actually owed to the supplier (same
  // guard as suppliers/index.ts's totalOutstanding and purchaseOrderPayments.ts).
  const [orders, suppliers] = await Promise.all([
    PurchaseOrder.find({
      clientId: session.clientId,
      status: { $in: ['Ordered', 'Partially Received', 'Received'] },
      balance: { $gt: 0 },
    }).lean() as Promise<PurchaseOrderDoc[]>,
    Supplier.find({ clientId: session.clientId }).select('name').lean() as Promise<SupplierDoc[]>,
  ]);
  const supplierNameById = new Map(suppliers.map((s) => [s._id.toString(), s.name]));

  const byBucket: Record<AgingBucket, { count: number; amount: number }> = {
    Current: { count: 0, amount: 0 },
    '1-30': { count: 0, amount: 0 },
    '31-60': { count: 0, amount: 0 },
    '61-90': { count: 0, amount: 0 },
    '90+': { count: 0, amount: 0 },
  };
  const bySupplier = new Map<string, { name: string; outstanding: number; oldestBucket: AgingBucket }>();

  for (const order of orders) {
    // Reference date: when the garage actually took delivery (receivedAt),
    // falling back to the order date for POs that are Ordered but not yet
    // received — same "receivedAt ?? order date" preference already used
    // for Supplier.lastOrder in suppliers/index.ts.
    const referenceDate = order.receivedAt ?? (order as unknown as { createdAt: Date }).createdAt;
    const bucket = bucketAge(daysBetween(referenceDate, now));
    byBucket[bucket].count += 1;
    byBucket[bucket].amount += order.balance;

    const key = order.supplierId.toString();
    const entry = bySupplier.get(key) ?? { name: supplierNameById.get(key) ?? 'Unknown supplier', outstanding: 0, oldestBucket: 'Current' as AgingBucket };
    entry.outstanding += order.balance;
    if (BUCKETS.indexOf(bucket) > BUCKETS.indexOf(entry.oldestBucket)) entry.oldestBucket = bucket;
    bySupplier.set(key, entry);
  }

  const totalOutstanding = orders.reduce((sum, order) => sum + order.balance, 0);

  return res.status(200).json({
    asOf: now,
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    byBucket: BUCKETS.map((bucket) => ({ bucket, count: byBucket[bucket].count, amount: Math.round(byBucket[bucket].amount * 100) / 100 })),
    suppliers: Array.from(bySupplier.entries())
      .map(([id, v]) => ({ id, name: v.name, outstanding: Math.round(v.outstanding * 100) / 100, oldestBucket: v.oldestBucket }))
      .sort((a, b) => b.outstanding - a.outstanding),
  });
}
