import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Branch, BranchDoc } from '../_lib/models/Branch';
import { requireTenant } from '../_lib/auth';
import { hasAddOn } from '../_lib/entitlements';
import { serializeBranch } from '../_lib/serializers';

interface CreateBranchBody {
  name?: string;
  address?: string;
  phone?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = requireTenant(req, res);
  if (!session) return;

  await connectToDatabase();
  const branches = (await Branch.find({ clientId: session.clientId }).sort({ name: 1 }).lean()) as BranchDoc[];
  return res.status(200).json({ branches: branches.map(serializeBranch) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = requireTenant(req, res);
  if (!session) return;

  if (!(await hasAddOn(session.clientId, 'gms-multi'))) {
    return res.status(400).json({ error: 'Multi-location Support is not enabled for this account' });
  }

  const { name, address, phone } = (req.body ?? {}) as CreateBranchBody;
  if (!name) return res.status(400).json({ error: 'name is required' });

  await connectToDatabase();

  const existingCount = await Branch.countDocuments({ clientId: session.clientId });
  const branch = await Branch.create({
    clientId: session.clientId,
    name,
    address,
    phone,
    isDefault: existingCount === 0, // the first branch a tenant creates is the default
  });

  return res.status(201).json({ branch: serializeBranch(branch.toObject()) });
}
