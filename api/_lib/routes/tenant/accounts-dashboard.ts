import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../models/PurchaseOrder.js';
import { Cheque, ChequeDoc } from '../../models/Cheque.js';
import { CollectionRecord, CollectionRecordDoc } from '../../models/CollectionRecord.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { requireTenantPermission } from '../../auth.js';
import { bucketAge, daysBetween, AgingBucket } from '../../aging.js';

const BUCKETS: AgingBucket[] = ['Current', '1-30', '31-60', '61-90', '90+'];

function summarizeAging(balances: { balance: number; referenceDate: Date }[], now: Date) {
  const byBucket: Record<AgingBucket, { count: number; amount: number }> = {
    Current: { count: 0, amount: 0 },
    '1-30': { count: 0, amount: 0 },
    '31-60': { count: 0, amount: 0 },
    '61-90': { count: 0, amount: 0 },
    '90+': { count: 0, amount: 0 },
  };
  let total = 0;
  for (const { balance, referenceDate } of balances) {
    const bucket = bucketAge(daysBetween(referenceDate, now));
    byBucket[bucket].count += 1;
    byBucket[bucket].amount += balance;
    total += balance;
  }
  return {
    total: Math.round(total * 100) / 100,
    byBucket: BUCKETS.map((bucket) => ({ bucket, count: byBucket[bucket].count, amount: Math.round(byBucket[bucket].amount * 100) / 100 })),
  };
}

// Dealer Credit Control roadmap Module 6, Phase 6.3 — the "Accounts"
// functional layer's own dashboard: day-to-day AR-operations visibility
// (aging, cheques pending clearance, today's collections, the Module 5 due-
// date calendar's own data), distinct from FinancialOverview.tsx's
// CFO-level P&L summary (revenue/expenses/net profit). Single endpoint,
// same "one aggregate call" convention as SalesDashboard/SF Dashboard.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  await connectToDatabase();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const [invoices, orders, pendingCheques, todayCollections, recentCollections] = await Promise.all([
    CustomerInvoice.find({ clientId: session.clientId, status: { $ne: 'Void' }, balance: { $gt: 0 } })
      .select('balance dueDate createdAt')
      .lean() as Promise<CustomerInvoiceDoc[]>,
    PurchaseOrder.find({ clientId: session.clientId, status: { $in: ['Ordered', 'Partially Received', 'Received'] }, balance: { $gt: 0 } })
      .select('balance expectedDate createdAt')
      .lean() as Promise<PurchaseOrderDoc[]>,
    Cheque.find({ clientId: session.clientId, status: { $in: ['Issued', 'Deposited'] } })
      .sort({ dueDate: 1 })
      .lean() as Promise<ChequeDoc[]>,
    CollectionRecord.find({ clientId: session.clientId, date: { $gte: startOfToday, $lt: endOfToday } })
      .lean() as Promise<CollectionRecordDoc[]>,
    CollectionRecord.find({ clientId: session.clientId }).sort({ date: -1 }).limit(10).lean() as Promise<CollectionRecordDoc[]>,
  ]);

  const arAging = summarizeAging(
    invoices.map((inv) => ({ balance: inv.balance, referenceDate: inv.dueDate ?? (inv as unknown as { createdAt: Date }).createdAt })),
    now
  );
  const apAging = summarizeAging(
    orders.map((o) => ({ balance: o.balance, referenceDate: o.expectedDate ?? (o as unknown as { createdAt: Date }).createdAt })),
    now
  );

  const customerIds = [...new Set(pendingCheques.filter((c) => c.customerId).map((c) => c.customerId!.toString()))];
  const supplierIds = [...new Set(pendingCheques.filter((c) => c.supplierId).map((c) => c.supplierId!.toString()))];
  const collectionCustomerIds = [...new Set(recentCollections.map((c) => c.customerId.toString()))];
  const [chequeCustomers, chequeSuppliers, collectionCustomers] = await Promise.all([
    customerIds.length > 0 ? (Customer.find({ _id: { $in: customerIds } }).select('name').lean() as Promise<CustomerDoc[]>) : Promise.resolve([]),
    supplierIds.length > 0 ? (Supplier.find({ _id: { $in: supplierIds } }).select('name').lean() as Promise<SupplierDoc[]>) : Promise.resolve([]),
    collectionCustomerIds.length > 0 ? (Customer.find({ _id: { $in: collectionCustomerIds } }).select('name').lean() as Promise<CustomerDoc[]>) : Promise.resolve([]),
  ]);
  const customerNameById = new Map([...chequeCustomers, ...collectionCustomers].map((c) => [c._id.toString(), c.name]));
  const supplierNameById = new Map(chequeSuppliers.map((s) => [s._id.toString(), s.name]));

  const todayCollectionsTotal = Math.round(todayCollections.reduce((sum, c) => sum + c.amount, 0) * 100) / 100;

  return res.status(200).json({
    asOf: now,
    arAging,
    apAging,
    cheques: {
      pendingCount: pendingCheques.length,
      pendingAmount: Math.round(pendingCheques.reduce((sum, c) => sum + c.amount, 0) * 100) / 100,
      upcoming: pendingCheques.slice(0, 10).map((c) => ({
        id: c._id.toString(),
        chequeNumber: c.chequeNumber,
        direction: c.direction,
        amount: c.amount,
        dueDate: c.dueDate,
        party: c.direction === 'incoming'
          ? (c.customerId ? customerNameById.get(c.customerId.toString()) : undefined)
          : (c.supplierId ? supplierNameById.get(c.supplierId.toString()) : undefined),
      })),
    },
    collections: {
      todayTotal: todayCollectionsTotal,
      todayCount: todayCollections.length,
      recent: recentCollections.map((c) => ({
        id: c._id.toString(),
        customerName: customerNameById.get(c.customerId.toString()),
        amount: c.amount,
        method: c.method,
        date: c.date,
      })),
    },
  });
}
