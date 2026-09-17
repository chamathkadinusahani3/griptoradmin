import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Cheque, ChequeDoc } from '../../models/Cheque.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../models/PurchaseOrder.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeCheque } from '../../serializers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'cheques:view');
  if (!session) return;

  const { status, direction } = req.query;
  await connectToDatabase();

  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof status === 'string') filter.status = status;
  if (typeof direction === 'string') filter.direction = direction;

  const cheques = (await Cheque.find(filter).sort({ dueDate: 1 }).lean()) as ChequeDoc[];
  if (cheques.length === 0) return res.status(200).json({ cheques: [] });

  const invoiceIds = cheques.filter((c) => c.sourceType === 'customer-invoice-payment').map((c) => c.sourceId);
  const poIds = cheques.filter((c) => c.sourceType === 'purchase-order-payment').map((c) => c.sourceId);
  const customerIds = [...new Set(cheques.map((c) => c.customerId?.toString()).filter((id): id is string => !!id))];
  const supplierIds = [...new Set(cheques.map((c) => c.supplierId?.toString()).filter((id): id is string => !!id))];

  const [invoices, purchaseOrders, customers, suppliers] = await Promise.all([
    invoiceIds.length > 0 ? (CustomerInvoice.find({ _id: { $in: invoiceIds }, clientId: session.clientId }).select('invoiceNumber').lean() as Promise<CustomerInvoiceDoc[]>) : Promise.resolve([]),
    poIds.length > 0 ? (PurchaseOrder.find({ _id: { $in: poIds }, clientId: session.clientId }).select('poNumber').lean() as Promise<PurchaseOrderDoc[]>) : Promise.resolve([]),
    customerIds.length > 0 ? (Customer.find({ _id: { $in: customerIds }, clientId: session.clientId }).select('name').lean() as Promise<CustomerDoc[]>) : Promise.resolve([]),
    supplierIds.length > 0 ? (Supplier.find({ _id: { $in: supplierIds }, clientId: session.clientId }).select('name').lean() as Promise<SupplierDoc[]>) : Promise.resolve([]),
  ]);
  const invoiceNumberById = new Map(invoices.map((i) => [i._id.toString(), i.invoiceNumber]));
  const poNumberById = new Map(purchaseOrders.map((p) => [p._id.toString(), p.poNumber]));
  const customerNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));
  const supplierNameById = new Map(suppliers.map((s) => [s._id.toString(), s.name]));

  return res.status(200).json({
    cheques: cheques.map((c) =>
      serializeCheque(c, {
        sourceNumber: c.sourceType === 'customer-invoice-payment' ? invoiceNumberById.get(c.sourceId.toString()) : poNumberById.get(c.sourceId.toString()),
        customerName: c.customerId ? customerNameById.get(c.customerId.toString()) : undefined,
        supplierName: c.supplierId ? supplierNameById.get(c.supplierId.toString()) : undefined,
      })
    ),
  });
}
