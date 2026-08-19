import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Warehouse, WarehouseDoc } from '../../models/Warehouse.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeWarehouse } from '../../serializers.js';

interface UpdateWarehouseBody {
  name?: string;
  isDefault?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'parts:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing warehouse id' });

  await connectToDatabase();

  const existing = (await Warehouse.findOne({ _id: id, clientId: session.clientId }).lean()) as WarehouseDoc | null;
  if (!existing) return res.status(404).json({ error: 'Warehouse not found' });

  const body = (req.body ?? {}) as UpdateWarehouseBody;
  const update: Record<string, unknown> = {};
  if (body.name !== undefined && body.name.trim()) update.name = body.name.trim();

  // Only one default per BRANCH (not tenant-wide) — each branch has its own
  // independent default warehouse, same scoping as the stock itself. A
  // branch-less warehouse's "bucket" is every other branch-less warehouse
  // (existing.branchId undefined would otherwise be dropped from the query
  // entirely and clear defaults across every branch).
  if (body.isDefault === true) {
    await Warehouse.updateMany(
      { clientId: session.clientId, branchId: existing.branchId ?? { $exists: false }, _id: { $ne: id } },
      { isDefault: false }
    );
    update.isDefault = true;
  }

  const warehouse = (await Warehouse.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as WarehouseDoc;

  return res.status(200).json({ warehouse: serializeWarehouse(warehouse) });
}
