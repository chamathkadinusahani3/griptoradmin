import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { SupplierQuotation, SupplierQuotationDoc } from '../../../models/SupplierQuotation.js';
import { RFQ, RFQDoc } from '../../../models/RFQ.js';
import { Supplier, SupplierDoc } from '../../../models/Supplier.js';
import { Part, PartDoc } from '../../../models/Part.js';
import { PurchaseOrder } from '../../../models/PurchaseOrder.js';
import { requireTenantPermission } from '../../../auth.js';
import { generateSequentialNumber } from '../../../numbering.js';
import { serializePurchaseOrder } from '../../../serializers.js';

// Selecting a quotation is the pipeline's finish line: Requisition -> RFQ ->
// Supplier Quotation -> (this) -> the real, existing PurchaseOrder model.
// No new schema on PurchaseOrder itself — this just builds one from the
// winning quotation's already-priced lines.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'purchase-orders:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing supplier quotation id' });

  await connectToDatabase();

  const quotation = (await SupplierQuotation.findOne({ _id: id, clientId: session.clientId }).lean()) as SupplierQuotationDoc | null;
  if (!quotation) return res.status(404).json({ error: 'Supplier quotation not found' });
  if (quotation.status !== 'Submitted') {
    return res.status(400).json({ error: 'Only a Submitted quotation can be selected' });
  }
  const rfq = (await RFQ.findOne({ _id: quotation.rfqId, clientId: session.clientId }).lean()) as RFQDoc | null;
  if (!rfq || rfq.status !== 'Open') {
    return res.status(400).json({ error: 'This RFQ is no longer open' });
  }
  const supplier = (await Supplier.findOne({ _id: quotation.supplierId, clientId: session.clientId }).lean()) as SupplierDoc | null;
  if (!supplier) return res.status(400).json({ error: 'Unknown supplier' });

  // A quotation line may not have a real Part yet (Requisitions/RFQs can ask
  // for something new, not-yet-catalogued) — resolve each to a real Part,
  // matching by name first so this doesn't silently create duplicates for
  // an item that already exists in Inventory.
  const poLines: { partId: string; name: string; quantity: number; unitCost: number }[] = [];
  for (const line of quotation.items) {
    let partId = line.partId?.toString();
    if (!partId) {
      const existingPart = (await Part.findOne({ clientId: session.clientId, name: line.name }).lean()) as PartDoc | null;
      if (existingPart) {
        partId = existingPart._id.toString();
      } else {
        const created = await Part.create({
          clientId: session.clientId,
          name: line.name,
          category: 'Uncategorized',
          stock: 0,
          reorderAt: 0,
          price: line.unitCost,
        });
        partId = created._id.toString();
      }
    }
    poLines.push({ partId: partId!, name: line.name, quantity: line.quantity, unitCost: line.unitCost });
  }

  const poNumber = await generateSequentialNumber(PurchaseOrder, session.clientId, 'poNumber', 'purchaseOrder');
  const order = await PurchaseOrder.create({
    clientId: session.clientId,
    supplierId: quotation.supplierId,
    poNumber,
    items: poLines,
    subtotal: quotation.subtotal,
    total: quotation.total,
    balance: quotation.total,
    status: 'Draft',
    notes: `Created from supplier quotation ${quotation.quotationNumber} (RFQ ${rfq.rfqNumber})`,
  });

  await Promise.all([
    SupplierQuotation.updateOne({ _id: id, clientId: session.clientId }, { status: 'Selected' }),
    SupplierQuotation.updateMany(
      { clientId: session.clientId, rfqId: quotation.rfqId, _id: { $ne: id }, status: 'Submitted' },
      { status: 'Rejected' }
    ),
    RFQ.updateOne({ _id: quotation.rfqId, clientId: session.clientId }, { status: 'Closed' }),
  ]);

  return res.status(201).json({ purchaseOrder: serializePurchaseOrder(order.toObject(), supplier.name) });
}
