import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { GoodsReceivedNote, GoodsReceivedNoteDoc } from '../../models/GoodsReceivedNote.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../models/PurchaseOrder.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeGoodsReceivedNote } from '../../serializers.js';

// Read-only — a GRN is only ever created as a side effect of actually
// receiving a purchase order (purchase-orders/[id].ts's handleReceive),
// never entered directly, so there's no POST here.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'purchase-orders:view');
  if (!session) return;

  await connectToDatabase();
  const { purchaseOrderId } = req.query;
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof purchaseOrderId === 'string') filter.purchaseOrderId = purchaseOrderId;

  const grns = (await GoodsReceivedNote.find(filter).sort({ createdAt: -1 }).lean()) as GoodsReceivedNoteDoc[];
  const poIds = [...new Set(grns.map((g) => g.purchaseOrderId.toString()))];
  const supplierIds = [...new Set(grns.map((g) => g.supplierId.toString()))];
  const [orders, suppliers] = await Promise.all([
    PurchaseOrder.find({ _id: { $in: poIds } }).select('poNumber').lean() as Promise<PurchaseOrderDoc[]>,
    Supplier.find({ _id: { $in: supplierIds } }).select('name').lean() as Promise<SupplierDoc[]>,
  ]);
  const poNumberById = new Map(orders.map((o) => [o._id.toString(), o.poNumber]));
  const supplierNameById = new Map(suppliers.map((s) => [s._id.toString(), s.name]));

  return res.status(200).json({
    grns: grns.map((g) =>
      serializeGoodsReceivedNote(g, poNumberById.get(g.purchaseOrderId.toString()), supplierNameById.get(g.supplierId.toString()))
    ),
  });
}
