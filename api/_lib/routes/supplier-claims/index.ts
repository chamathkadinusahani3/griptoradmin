import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SupplierClaim, SupplierClaimDoc, SUPPLIER_CLAIM_REASONS } from '../../models/SupplierClaim.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../models/PurchaseOrder.js';
import { requireTenantPermission } from '../../auth.js';
import { generateSequentialNumber } from '../../numbering.js';
import { serializeSupplierClaim } from '../../serializers.js';

interface CreateSupplierClaimBody {
  supplierId?: string;
  purchaseOrderId?: string;
  reason?: string;
  description?: string;
  amountClaimed?: number;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'complaints:view');
  if (!session) return;

  await connectToDatabase();
  const claims = (await SupplierClaim.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as SupplierClaimDoc[];
  const supplierIds = [...new Set(claims.map((c) => c.supplierId.toString()))];
  const poIds = [...new Set(claims.map((c) => c.purchaseOrderId?.toString()).filter(Boolean) as string[])];
  const [suppliers, orders] = await Promise.all([
    Supplier.find({ _id: { $in: supplierIds } }).select('name').lean() as Promise<SupplierDoc[]>,
    PurchaseOrder.find({ _id: { $in: poIds } }).select('poNumber').lean() as Promise<PurchaseOrderDoc[]>,
  ]);
  const supplierNameById = new Map(suppliers.map((s) => [s._id.toString(), s.name]));
  const poNumberById = new Map(orders.map((o) => [o._id.toString(), o.poNumber]));

  return res.status(200).json({
    claims: claims.map((c) =>
      serializeSupplierClaim(c, supplierNameById.get(c.supplierId.toString()), c.purchaseOrderId ? poNumberById.get(c.purchaseOrderId.toString()) : undefined)
    ),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'complaints:manage');
  if (!session) return;

  const { supplierId, purchaseOrderId, reason, description, amountClaimed, notes } = (req.body ?? {}) as CreateSupplierClaimBody;
  if (!supplierId || !reason || !description?.trim() || !amountClaimed || amountClaimed <= 0) {
    return res.status(400).json({ error: 'supplierId, reason, description, and a positive amountClaimed are required' });
  }
  if (!(SUPPLIER_CLAIM_REASONS as readonly string[]).includes(reason)) {
    return res.status(400).json({ error: `reason must be one of: ${SUPPLIER_CLAIM_REASONS.join(', ')}` });
  }

  await connectToDatabase();

  const supplier = (await Supplier.findOne({ _id: supplierId, clientId: session.clientId }).lean()) as SupplierDoc | null;
  if (!supplier) return res.status(400).json({ error: 'Unknown supplier' });

  let poNumber: string | undefined;
  if (purchaseOrderId) {
    const order = (await PurchaseOrder.findOne({ _id: purchaseOrderId, clientId: session.clientId, supplierId }).lean()) as PurchaseOrderDoc | null;
    if (!order) return res.status(400).json({ error: 'Unknown purchase order for this supplier' });
    poNumber = order.poNumber;
  }

  const claimNumber = await generateSequentialNumber(SupplierClaim, session.clientId, 'claimNumber', 'supplierClaim');

  const claim = await SupplierClaim.create({
    clientId: session.clientId,
    claimNumber,
    supplierId,
    purchaseOrderId: purchaseOrderId || undefined,
    reason,
    description: description.trim(),
    amountClaimed,
    notes,
  });

  return res.status(201).json({ claim: serializeSupplierClaim(claim.toObject(), supplier.name, poNumber) });
}
