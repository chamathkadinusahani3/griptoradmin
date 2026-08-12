import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../../models/PurchaseOrder.js';
import { Supplier, SupplierDoc } from '../../../models/Supplier.js';
import { requireTenantPermission } from '../../../auth.js';
import { serializePurchaseOrder } from '../../../serializers.js';

interface ReconcileBody {
  paymentId?: string;
  reconciled?: boolean;
}

// The garage-pays-supplier mirror of customer-invoices/[id]/reconcile.ts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'purchase-orders:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing purchase order id' });

  const { paymentId, reconciled } = (req.body ?? {}) as ReconcileBody;
  if (!paymentId || typeof reconciled !== 'boolean') {
    return res.status(400).json({ error: 'paymentId and a boolean reconciled are required' });
  }

  await connectToDatabase();

  const order = (await PurchaseOrder.findOneAndUpdate(
    { _id: id, clientId: session.clientId, 'paymentHistory._id': paymentId },
    {
      $set: {
        'paymentHistory.$.reconciled': reconciled,
        'paymentHistory.$.reconciledAt': reconciled ? new Date() : null,
      },
    },
    { returnDocument: 'after' }
  ).lean()) as PurchaseOrderDoc | null;
  if (!order) return res.status(404).json({ error: 'Purchase order or payment not found' });

  const supplier = (await Supplier.findById(order.supplierId).lean()) as SupplierDoc | null;
  return res.status(200).json({ purchaseOrder: serializePurchaseOrder(order, supplier?.name) });
}
