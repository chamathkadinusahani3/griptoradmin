import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../../models/CustomerInvoice.js';
import { Customer, CustomerDoc } from '../../../models/Customer.js';
import { requireTenantPermission } from '../../../auth.js';
import { serializeCustomerInvoice } from '../../../serializers.js';

interface ReconcileBody {
  paymentId?: string;
  reconciled?: boolean;
}

// The whole "reconciliation" feature, deliberately kept this simple: flip a
// per-payment flag once it's confirmed to show up on the actual bank
// statement. No statement import/matching — see PurchaseOrder's identical
// route for the other direction of money.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'customer-invoices:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing invoice id' });

  const { paymentId, reconciled } = (req.body ?? {}) as ReconcileBody;
  if (!paymentId || typeof reconciled !== 'boolean') {
    return res.status(400).json({ error: 'paymentId and a boolean reconciled are required' });
  }

  await connectToDatabase();

  const invoice = (await CustomerInvoice.findOneAndUpdate(
    { _id: id, clientId: session.clientId, 'paymentHistory._id': paymentId },
    {
      $set: {
        'paymentHistory.$.reconciled': reconciled,
        'paymentHistory.$.reconciledAt': reconciled ? new Date() : null,
      },
    },
    { returnDocument: 'after' }
  ).lean()) as CustomerInvoiceDoc | null;
  if (!invoice) return res.status(404).json({ error: 'Invoice or payment not found' });

  const customer = (await Customer.findById(invoice.customerId).lean()) as CustomerDoc | null;
  return res.status(200).json({ invoice: serializeCustomerInvoice(invoice, customer?.name) });
}
