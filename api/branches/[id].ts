import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Branch, BranchDoc } from '../_lib/models/Branch';
import { requireTenant } from '../_lib/auth';
import { serializeBranch } from '../_lib/serializers';

interface UpdateBranchBody {
  name?: string;
  address?: string;
  phone?: string;
  isDefault?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing branch id' });

  await connectToDatabase();

  const existing = await Branch.findOne({ _id: id, clientId: session.clientId }).lean();
  if (!existing) return res.status(404).json({ error: 'Branch not found' });

  const body = (req.body ?? {}) as UpdateBranchBody;
  const update: Record<string, unknown> = {};
  for (const key of ['name', 'address', 'phone'] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  // Only one branch can be default — clear the others in the same tenant
  // when this one is promoted.
  if (body.isDefault === true) {
    await Branch.updateMany({ clientId: session.clientId, _id: { $ne: id } }, { isDefault: false });
    update.isDefault = true;
  }

  const branch = (await Branch.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as BranchDoc;

  return res.status(200).json({ branch: serializeBranch(branch) });
}
