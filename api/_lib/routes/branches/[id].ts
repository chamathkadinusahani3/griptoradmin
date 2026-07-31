import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Branch, BranchDoc } from '../../models/Branch.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeBranch } from '../../serializers.js';

interface UpdateBranchBody {
  name?: string;
  address?: string;
  phone?: string;
  isDefault?: boolean;
  // undefined = leave untouched; null = clear (capacityPerSlot falls back to
  // Client.capacityPerSlot; serviceCategories falls back to full-service).
  capacityPerSlot?: number | null;
  serviceCategories?: string[] | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'branches:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing branch id' });

  await connectToDatabase();

  const existing = await Branch.findOne({ _id: id, clientId: session.clientId }).lean();
  if (!existing) return res.status(404).json({ error: 'Branch not found' });

  const body = (req.body ?? {}) as UpdateBranchBody;
  const update: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  for (const key of ['name', 'address', 'phone'] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (body.capacityPerSlot !== undefined) {
    if (body.capacityPerSlot === null) unset.capacityPerSlot = 1;
    else update.capacityPerSlot = body.capacityPerSlot;
  }
  if (body.serviceCategories !== undefined) {
    if (body.serviceCategories === null || body.serviceCategories.length === 0) unset.serviceCategories = 1;
    else update.serviceCategories = body.serviceCategories;
  }

  // Only one branch can be default — clear the others in the same tenant
  // when this one is promoted.
  if (body.isDefault === true) {
    await Branch.updateMany({ clientId: session.clientId, _id: { $ne: id } }, { isDefault: false });
    update.isDefault = true;
  }

  const updateOp: Record<string, unknown> = {
    ...(Object.keys(update).length > 0 ? { $set: update } : {}),
    ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
  };

  const branch = (await Branch.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    updateOp,
    { returnDocument: 'after' }
  ).lean()) as BranchDoc;

  return res.status(200).json({ branch: serializeBranch(branch) });
}
