import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Return, ReturnDoc } from '../../../models/Return.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../../models/PurchaseOrder.js';
import { Supplier, SupplierDoc } from '../../../models/Supplier.js';
import { requireTenantPermission } from '../../../auth.js';
import { serializeReturn } from '../../../serializers.js';

interface ReconcileBody {
  reconciled?: boolean;
}

// Simpler than the invoice/PO version — a Return's refund fields live
// directly on the document itself (not a nested paymentHistory array), so
// there's no paymentId to address, just the Return's own id.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'returns:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing return id' });

  const { reconciled } = (req.body ?? {}) as ReconcileBody;
  if (typeof reconciled !== 'boolean') return res.status(400).json({ error: 'A boolean reconciled is required' });

  await connectToDatabase();

  const existing = (await Return.findOne({ _id: id, clientId: session.clientId }).lean()) as ReturnDoc | null;
  if (!existing) return res.status(404).json({ error: 'Return not found' });
  if (!existing.refundAmount) return res.status(400).json({ error: 'This return has no refund to reconcile' });

  const updated = (await Return.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    { reconciled, reconciledAt: reconciled ? new Date() : null },
    { returnDocument: 'after' }
  ).lean()) as ReturnDoc;

  let party: string | undefined;
  let reference: string | undefined;
  if (updated.sourceType === 'purchase-order') {
    const order = (await PurchaseOrder.findById(updated.sourceId).lean()) as PurchaseOrderDoc | null;
    reference = order?.poNumber;
    if (order) {
      const supplier = (await Supplier.findById(order.supplierId).lean()) as SupplierDoc | null;
      party = supplier?.name;
    }
  }

  return res.status(200).json({ return: serializeReturn(updated, party, reference) });
}
