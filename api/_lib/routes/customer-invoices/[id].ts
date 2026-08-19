import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeCustomerInvoice } from '../../serializers.js';
import { computeTotals, getTaxRatePct, LineItemInput } from '../../accounting.js';

interface UpdateInvoiceBody {
  vehicle?: string;
  plate?: string;
  items?: LineItemInput[];
  status?: 'Draft' | 'Issued' | 'Paid' | 'Void';
  dueDate?: string;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'customer-invoices:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing invoice id' });

  await connectToDatabase();

  const existing = (await CustomerInvoice.findOne({ _id: id, clientId: session.clientId }).lean()) as CustomerInvoiceDoc | null;
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });

  const body = (req.body ?? {}) as UpdateInvoiceBody;
  const update: Record<string, unknown> = {};
  for (const key of ['vehicle', 'plate', 'status', 'notes'] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (body.dueDate !== undefined) update.dueDate = new Date(body.dueDate);
  if (body.items !== undefined) {
    // Preserves the invoice's own existing discountPct rather than
    // resetting it to 0, same reasoning as api/quotations/[id].ts.
    const taxRatePct = await getTaxRatePct(session.clientId);
    const { items, subtotal, discountPct, discountAmount, taxAmount, total } = computeTotals(
      body.items,
      existing.discountPct ?? 0,
      taxRatePct
    );
    update.items = items;
    update.subtotal = subtotal;
    update.discountPct = discountPct;
    update.discountAmount = discountAmount;
    update.taxAmount = taxAmount;
    update.total = total;
    // Re-derive balance against the (possibly changed) total, same payment
    // history — matches the same server-computed discipline the payment
    // endpoint uses, just triggered by a total change instead of a payment.
    update.balance = Math.round((total - existing.paidAmount) * 100) / 100;
  }

  const invoice = (await CustomerInvoice.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as CustomerInvoiceDoc;

  const customer = (await Customer.findById(invoice.customerId).lean()) as CustomerDoc | null;

  return res.status(200).json({ invoice: serializeCustomerInvoice(invoice, customer?.name) });
}
