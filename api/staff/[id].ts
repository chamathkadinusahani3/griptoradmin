import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { User, UserDoc } from '../_lib/models/User';
import { requireTenantManager, TenantRole } from '../_lib/auth';
import { isValidBranch } from '../_lib/branch';
import { serializeUser } from '../_lib/serializers';

interface UpdateStaffBody {
  tenantRole?: TenantRole;
  branchId?: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'PATCH') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleRemove(req, res);
  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  const session = requireTenantManager(req, res);
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing staff id' });

  await connectToDatabase();
  const member = (await User.findOne({ _id: id, role: 'tenant', clientId: session.clientId }).lean()) as UserDoc | null;
  if (!member) return res.status(404).json({ error: 'Staff member not found' });

  const { tenantRole, branchId } = (req.body ?? {}) as UpdateStaffBody;

  // Same backfill-at-read discipline as serializeUser/requireTenant — a
  // pre-existing single-login garage owner has no tenantRole stored at all,
  // and must still be treated as a protected Owner, not silently demotable.
  const memberRole = member.tenantRole ?? 'Owner';
  if (memberRole === 'Owner' && tenantRole !== undefined && tenantRole !== 'Owner') {
    return res.status(403).json({ error: 'The Owner’s role cannot be changed' });
  }
  if (branchId && !(await isValidBranch(session.clientId, branchId))) {
    return res.status(400).json({ error: 'Unknown branch' });
  }

  const update: Record<string, unknown> = {};
  if (tenantRole !== undefined) update.tenantRole = tenantRole;
  if (branchId !== undefined) update.branchId = branchId || null;

  const updated = (await User.findOneAndUpdate(
    { _id: id, role: 'tenant', clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as UserDoc;

  return res.status(200).json({ member: serializeUser(updated) });
}

async function handleRemove(req: VercelRequest, res: VercelResponse) {
  const session = requireTenantManager(req, res);
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing staff id' });

  if (id === session.sub) {
    return res.status(403).json({ error: 'You cannot remove yourself' });
  }

  await connectToDatabase();
  const member = (await User.findOne({ _id: id, role: 'tenant', clientId: session.clientId }).lean()) as UserDoc | null;
  if (!member) return res.status(404).json({ error: 'Staff member not found' });

  if ((member.tenantRole ?? 'Owner') === 'Owner') {
    return res.status(403).json({ error: 'The Owner cannot be removed' });
  }

  await User.deleteOne({ _id: id, clientId: session.clientId });
  return res.status(200).json({ ok: true });
}
