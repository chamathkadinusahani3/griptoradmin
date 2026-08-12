import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../models/PurchaseOrder.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { BankAccount, BankAccountDoc } from '../../models/BankAccount.js';
import { Return, ReturnDoc } from '../../models/Return.js';
import { requireTenantPermission } from '../../auth.js';

// The single unified "transactions" feed this whole feature was building
// toward — every payment ever recorded, from BOTH directions of money
// (customers paying the garage, the garage paying suppliers), merged into
// one list so "transaction volume" and reconciliation aren't split across
// two unrelated pages. Read-only: reconciling happens via
// customer-invoices/[id]/reconcile.ts or purchase-orders/[id]/reconcile.ts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'bank-accounts:view');
  if (!session) return;

  await connectToDatabase();

  const [invoices, orders, returns, customers, suppliers, bankAccounts] = await Promise.all([
    CustomerInvoice.find({ clientId: session.clientId, 'paymentHistory.0': { $exists: true } }).lean() as Promise<CustomerInvoiceDoc[]>,
    PurchaseOrder.find({ clientId: session.clientId, 'paymentHistory.0': { $exists: true } }).lean() as Promise<PurchaseOrderDoc[]>,
    Return.find({ clientId: session.clientId, refundAmount: { $gt: 0 } }).lean() as Promise<ReturnDoc[]>,
    Customer.find({ clientId: session.clientId }).select('name').lean() as Promise<CustomerDoc[]>,
    Supplier.find({ clientId: session.clientId }).select('name').lean() as Promise<SupplierDoc[]>,
    BankAccount.find({ clientId: session.clientId }).select('bankName accountNumber').lean() as Promise<BankAccountDoc[]>,
  ]);
  const orderSupplierIdByOrderId = new Map(orders.map((o) => [o._id.toString(), o.supplierId.toString()]));
  // Returns against a PO whose payment history is empty (never fetched
  // above) still need the supplier resolved for the party column.
  const returnOrderIds = returns.filter((r) => r.sourceType === 'purchase-order').map((r) => r.sourceId);
  const returnOrders = returnOrderIds.length
    ? ((await PurchaseOrder.find({ _id: { $in: returnOrderIds } }).select('supplierId poNumber').lean()) as PurchaseOrderDoc[])
    : [];
  for (const o of returnOrders) orderSupplierIdByOrderId.set(o._id.toString(), o.supplierId.toString());
  const returnPoNumberById = new Map(returnOrders.map((o) => [o._id.toString(), o.poNumber]));

  const customerNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));
  const supplierNameById = new Map(suppliers.map((s) => [s._id.toString(), s.name]));
  const bankAccountById = new Map(bankAccounts.map((b) => [b._id.toString(), `${b.bankName} · ${b.accountNumber}`]));

  interface Transaction {
    id: string;
    direction: 'in' | 'out';
    date: Date;
    amount: number;
    method: string;
    chequeNumber?: string;
    bankAccountId?: string;
    bankAccount?: string;
    reconciled: boolean;
    party?: string;
    reference: string;
    sourceId: string;
    sourceType: 'invoice' | 'purchase-order' | 'return';
  }

  const transactions: Transaction[] = [];

  for (const inv of invoices) {
    for (const p of inv.paymentHistory) {
      transactions.push({
        id: p._id!.toString(),
        direction: 'in',
        date: p.date,
        amount: p.amount,
        method: p.method,
        chequeNumber: p.chequeNumber ?? undefined,
        bankAccountId: p.bankAccountId?.toString(),
        bankAccount: p.bankAccountId ? bankAccountById.get(p.bankAccountId.toString()) : undefined,
        reconciled: !!p.reconciled,
        party: customerNameById.get(inv.customerId.toString()),
        reference: inv.invoiceNumber,
        sourceId: inv._id.toString(),
        sourceType: 'invoice',
      });
    }
  }

  for (const order of orders) {
    for (const p of order.paymentHistory) {
      transactions.push({
        id: p._id!.toString(),
        direction: 'out',
        date: p.date,
        amount: p.amount,
        method: p.method,
        chequeNumber: p.chequeNumber ?? undefined,
        bankAccountId: p.bankAccountId?.toString(),
        bankAccount: p.bankAccountId ? bankAccountById.get(p.bankAccountId.toString()) : undefined,
        reconciled: !!p.reconciled,
        party: supplierNameById.get(order.supplierId.toString()),
        reference: order.poNumber,
        sourceId: order._id.toString(),
        sourceType: 'purchase-order',
      });
    }
  }

  for (const ret of returns) {
    // Customer return: the garage hands cash back out. Supplier return:
    // the garage receives a credit/refund back in — the same 'in'/'out'
    // convention as invoice payments (customer -> garage) and PO payments
    // (garage -> supplier).
    const direction = ret.direction === 'customer' ? 'out' : 'in';
    const supplierId = ret.sourceType === 'purchase-order' ? orderSupplierIdByOrderId.get(ret.sourceId.toString()) : undefined;
    transactions.push({
      id: ret._id.toString(),
      direction,
      date: ret.refundDate ?? (ret as unknown as { createdAt: Date }).createdAt,
      amount: ret.refundAmount!,
      method: ret.refundMethod!,
      chequeNumber: ret.chequeNumber ?? undefined,
      bankAccountId: ret.bankAccountId?.toString(),
      bankAccount: ret.bankAccountId ? bankAccountById.get(ret.bankAccountId.toString()) : undefined,
      reconciled: !!ret.reconciled,
      party: supplierId ? supplierNameById.get(supplierId) : undefined,
      reference: (ret.sourceType === 'purchase-order' && returnPoNumberById.get(ret.sourceId.toString())) || ret.returnNumber,
      sourceId: ret._id.toString(),
      sourceType: 'return',
    });
  }

  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalIn = transactions.filter((t) => t.direction === 'in').reduce((sum, t) => sum + t.amount, 0);
  const totalOut = transactions.filter((t) => t.direction === 'out').reduce((sum, t) => sum + t.amount, 0);
  const chequeCount = transactions.filter((t) => t.method === 'Cheque').length;
  const pendingReconciliation = transactions.filter((t) => !t.reconciled).length;

  return res.status(200).json({
    transactions,
    summary: {
      totalIn: Math.round(totalIn * 100) / 100,
      totalOut: Math.round(totalOut * 100) / 100,
      transactionCount: transactions.length,
      chequeCount,
      pendingReconciliation,
    },
  });
}
