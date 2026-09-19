import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Part } from '../../models/Part.js';
import { Sale } from '../../models/Sale.js';
import { SalesOrder } from '../../models/SalesOrder.js';
import { PurchaseOrder } from '../../models/PurchaseOrder.js';
import { PurchaseInvoice } from '../../models/PurchaseInvoice.js';
import { GoodsReceivedNote } from '../../models/GoodsReceivedNote.js';
import { DeliveryNote } from '../../models/DeliveryNote.js';
import { Return } from '../../models/Return.js';
import { StockIssue } from '../../models/StockIssue.js';
import { StockAdjustment } from '../../models/StockAdjustment.js';
import { StockCount } from '../../models/StockCount.js';
import { StockTransfer } from '../../models/StockTransfer.js';
import { JobCard } from '../../models/JobCard.js';
import { WarrantyClaim } from '../../models/WarrantyClaim.js';
import { requireTenantPermission } from '../../auth.js';

// Delete guard — real transactional/movement history a hard delete would
// silently orphan (a document left pointing at a Part that no longer
// exists). Deliberately does NOT include PriceList overrides, Promotion
// eligibility lists, RFQ/PurchaseRequisition/SupplierQuotation (pre-PO,
// not-yet-committed stages), or SmsLog — those are configuration/pipeline
// references, not committed history, same "real documents only" line the
// Customer delete guard draws (api/_lib/routes/customers/[id].ts).
const PART_HISTORY_CHECKS = [
  { model: Sale, filter: (id: string) => ({ 'items.partId': id }), label: 'sales' },
  { model: SalesOrder, filter: (id: string) => ({ 'items.partId': id }), label: 'sales orders' },
  { model: PurchaseOrder, filter: (id: string) => ({ 'items.partId': id }), label: 'purchase orders' },
  { model: PurchaseInvoice, filter: (id: string) => ({ 'items.partId': id }), label: 'purchase invoices' },
  { model: GoodsReceivedNote, filter: (id: string) => ({ 'items.partId': id }), label: 'goods received notes' },
  { model: DeliveryNote, filter: (id: string) => ({ 'items.partId': id }), label: 'delivery notes' },
  { model: Return, filter: (id: string) => ({ 'items.partId': id }), label: 'returns' },
  { model: StockIssue, filter: (id: string) => ({ 'items.partId': id }), label: 'stock issues' },
  { model: JobCard, filter: (id: string) => ({ 'partsUsed.partId': id }), label: 'job cards' },
  { model: StockAdjustment, filter: (id: string) => ({ partId: id }), label: 'stock adjustments' },
  { model: StockCount, filter: (id: string) => ({ 'lines.partId': id }), label: 'stock counts' },
  { model: StockTransfer, filter: (id: string) => ({ $or: [{ fromPartId: id }, { toPartId: id }] }), label: 'stock transfers' },
  { model: WarrantyClaim, filter: (id: string) => ({ partId: id }), label: 'warranty claims' },
] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'parts:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing part id' });

  await connectToDatabase();

  const existing = await Part.findOne({ _id: id, clientId: session.clientId }).lean();
  if (!existing) return res.status(404).json({ error: 'Part not found' });

  const hits = await Promise.all(
    PART_HISTORY_CHECKS.map(async ({ model, filter, label }) =>
      (await model.exists({ clientId: session.clientId, ...filter(id) })) ? label : null
    )
  );
  const blockingLabels = hits.filter((label) => label !== null) as string[];
  if (blockingLabels.length > 0) {
    return res.status(400).json({ error: `This part has existing ${blockingLabels.join(', ')} and cannot be deleted` });
  }

  await Part.deleteOne({ _id: id, clientId: session.clientId });
  return res.status(200).json({ success: true });
}
