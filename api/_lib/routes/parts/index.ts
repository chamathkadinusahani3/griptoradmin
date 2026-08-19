import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Part, PartDoc } from '../../models/Part.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { requireTenantPermission } from '../../auth.js';
import { isValidBranch, resolveBranchFilter } from '../../branch.js';
import { isValidWarehouse } from '../../warehouse.js';
import { serializePart } from '../../serializers.js';

interface CreatePartBody {
  name?: string;
  sku?: string;
  barcode?: string;
  category?: string;
  stock?: number;
  reorderAt?: number;
  price?: number;
  supplierId?: string;
  branchId?: string;
  warehouseId?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'parts:view');
  if (!session) return;

  await connectToDatabase();
  const { branchId, warehouseId } = req.query;
  const effectiveBranchId = resolveBranchFilter(session, typeof branchId === 'string' ? branchId : undefined);
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (effectiveBranchId) filter.branchId = effectiveBranchId;
  if (typeof warehouseId === 'string') filter.warehouseId = warehouseId;
  const parts = (await Part.find(filter).sort({ createdAt: -1 }).lean()) as PartDoc[];
  const suppliers = (await Supplier.find({ clientId: session.clientId }).lean()) as SupplierDoc[];
  const nameById = new Map(suppliers.map((s) => [s._id.toString(), s.name]));

  return res.status(200).json({
    parts: parts.map((p) => serializePart(p, p.supplierId ? nameById.get(p.supplierId.toString()) : undefined)),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'parts:manage');
  if (!session) return;

  const { name, sku, barcode, category, stock, reorderAt, price, supplierId, branchId, warehouseId } = (req.body ?? {}) as CreatePartBody;
  if (!name || !category) {
    return res.status(400).json({ error: 'name and category are required' });
  }

  await connectToDatabase();

  let supplier: SupplierDoc | null = null;
  if (supplierId) {
    supplier = (await Supplier.findOne({ _id: supplierId, clientId: session.clientId }).lean()) as SupplierDoc | null;
    if (!supplier) return res.status(400).json({ error: 'Unknown supplier' });
  }
  if (branchId && !(await isValidBranch(session.clientId, branchId))) {
    return res.status(400).json({ error: 'Unknown branch' });
  }
  if (warehouseId && !(await isValidWarehouse(session.clientId, warehouseId))) {
    return res.status(400).json({ error: 'Unknown warehouse' });
  }

  const part = await Part.create({
    clientId: session.clientId,
    name,
    sku,
    barcode,
    category,
    stock: stock ?? 0,
    reorderAt: reorderAt ?? 0,
    price: price ?? 0,
    supplierId: supplierId || undefined,
    branchId: branchId || undefined,
    warehouseId: warehouseId || undefined,
  });

  return res.status(201).json({ part: serializePart(part.toObject(), supplier?.name) });
}
