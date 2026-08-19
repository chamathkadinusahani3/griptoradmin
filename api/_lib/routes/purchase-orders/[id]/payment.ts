import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Supplier, SupplierDoc } from '../../../models/Supplier.js';
import { requireTenantPermission } from '../../../auth.js';
import { serializePurchaseOrder } from '../../../serializers.js';
import { recordPurchaseOrderPayment } from '../../../purchaseOrderPayments.js';

interface RecordPaymentBody {
  amount?: number;
  method?: 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Other';
  date?: string;
  notes?: string;
  chequeNumber?: string;
  bankAccountId?: string;
}

// Manual payment recording against a supplier's purchase order — the
// garage-pays-supplier mirror of api/_lib/routes/customer-invoices/[id]/payment.ts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'purchase-orders:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing purchase order id' });

  const { amount, method, date, notes, chequeNumber, bankAccountId } = (req.body ?? {}) as RecordPaymentBody;
  if (!amount || amount <= 0 || !method) {
    return res.status(400).json({ error: 'A positive amount and a payment method are required' });
  }
  if (method === 'Cheque' && !chequeNumber?.trim()) {
    return res.status(400).json({ error: 'A cheque number is required for cheque payments' });
  }

  await connectToDatabase();

  const order = await recordPurchaseOrderPayment(id, session.clientId, {
    amount,
    method,
    date: date ? new Date(date) : undefined,
    notes,
    chequeNumber: method === 'Cheque' ? chequeNumber : undefined,
    bankAccountId,
  });
  if (!order) return res.status(400).json({ error: 'This purchase order was not found or is not payable (must be Ordered, Partially Received, or Received)' });

  const supplier = (await Supplier.findById(order.supplierId).lean()) as SupplierDoc | null;

  return res.status(200).json({ purchaseOrder: serializePurchaseOrder(order, supplier?.name) });
}
