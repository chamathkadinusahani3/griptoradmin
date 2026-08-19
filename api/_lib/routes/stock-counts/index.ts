import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { StockCount, StockCountDoc } from '../../models/StockCount.js';
import { Part, PartDoc } from '../../models/Part.js';
import { requireTenantPermission } from '../../auth.js';
import { isValidBranch } from '../../branch.js';
import { isValidWarehouse } from '../../warehouse.js';
import { serializeStockCount } from '../../serializers.js';

interface CreateStockCountBody {
  branchId?: string;
  warehouseId?: string;
  notes?: string;
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
  const counts = (await StockCount.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as StockCountDoc[];
  return res.status(200).json({ stockCounts: counts.map(serializeStockCount) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'parts:manage');
  if (!session) return;

  const { branchId, warehouseId, notes } = (req.body ?? {}) as CreateStockCountBody;

  await connectToDatabase();

  if (branchId && !(await isValidBranch(session.clientId, branchId))) {
    return res.status(400).json({ error: 'Unknown branch' });
  }
  if (warehouseId && !(await isValidWarehouse(session.clientId, warehouseId))) {
    return res.status(400).json({ error: 'Unknown warehouse' });
  }

  // Snapshot every matching Part's current stock as the "expected" quantity
  // to count against — a count scoped to nothing (no branch/warehouse) is a
  // full tenant-wide count.
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (warehouseId) filter.warehouseId = warehouseId;
  else if (branchId) filter.branchId = branchId;
  const parts = (await Part.find(filter).lean()) as PartDoc[];
  if (parts.length === 0) {
    return res.status(400).json({ error: 'No parts found in that scope to count' });
  }

  const stockCount = await StockCount.create({
    clientId: session.clientId,
    branchId: branchId || undefined,
    warehouseId: warehouseId || undefined,
    status: 'Open',
    lines: parts.map((p) => ({ partId: p._id, name: p.name, systemQty: p.stock, countedQty: null })),
    notes,
  });

  return res.status(201).json({ stockCount: serializeStockCount(stockCount.toObject()) });
}
