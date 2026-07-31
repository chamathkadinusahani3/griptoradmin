import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Customer, CustomerDoc } from '../../../models/Customer.js';
import { requireTenantPermission } from '../../../auth.js';
import { serializeCustomerInvoice } from '../../../serializers.js';
import { recordCustomerInvoicePayment } from '../../../customerInvoicePayments.js';

interface RecordPaymentBody {
  amount?: number;
  method?: 'Cash' | 'Card' | 'Bank Transfer' | 'Other';
  date?: string;
  notes?: string;
}

// Manual payment recording — the real gateway path is
// api/public/payhere-notify.ts; both share the exact same money math via
// recordCustomerInvoicePayment() (api/_lib/customerInvoicePayments.ts) so
// they can never diverge.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'customer-invoices:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing invoice id' });

  const { amount, method, date, notes } = (req.body ?? {}) as RecordPaymentBody;
  if (!amount || amount <= 0 || !method) {
    return res.status(400).json({ error: 'A positive amount and a payment method are required' });
  }

  await connectToDatabase();

  const invoice = await recordCustomerInvoicePayment(id, session.clientId, {
    amount,
    method,
    date: date ? new Date(date) : undefined,
    notes,
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const customer = (await Customer.findById(invoice.customerId).lean()) as CustomerDoc | null;

  return res.status(200).json({ invoice: serializeCustomerInvoice(invoice, customer?.name) });
}
