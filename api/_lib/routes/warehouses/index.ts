import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Warehouse, WarehouseDoc } from '../../models/Warehouse.js';
import { requireTenantPermission } from '../../auth.js';
import { isValidBranch } from '../../branch.js';
import { hasAddOn } from '../../entitlements.js';
import { serializeWarehouse } from '../../serializers.js';

interface CreateWarehouseBody {
  branchId?: string;
  name?: string;
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
  const { branchId } = req.query;
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof branchId === 'string') filter.branchId = branchId;
  const warehouses = (await Warehouse.find(filter).sort({ name: 1 }).lean()) as WarehouseDoc[];
  return res.status(200).json({ warehouses: warehouses.map(serializeWarehouse) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'parts:manage');
  if (!session) return;

  const { branchId, name } = (req.body ?? {}) as CreateWarehouseBody;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  await connectToDatabase();

  if (!(await hasAddOn(session.clientId, 'pos-warehouse'))) {
    return res.status(400).json({ error: 'Multi-warehouse Sync is not enabled for this account' });
  }
  if (branchId && !(await isValidBranch(session.clientId, branchId))) {
    return res.status(400).json({ error: 'Unknown branch' });
  }

  // "Default" is scoped within whatever bucket this warehouse belongs to —
  // its branch if one was given, or the tenant-wide unassigned bucket
  // (branchId unset) otherwise.
  const existingCount = await Warehouse.countDocuments({ clientId: session.clientId, branchId: branchId || { $exists: false } });
  const warehouse = await Warehouse.create({
    clientId: session.clientId,
    branchId: branchId || undefined,
    name,
    isDefault: existingCount === 0,
  });

  return res.status(201).json({ warehouse: serializeWarehouse(warehouse.toObject()) });
}
