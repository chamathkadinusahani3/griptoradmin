import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { User, UserDoc } from '../../models/User.js';
import { Role, RoleDoc } from '../../models/Role.js';
import { requireTenantPermission } from '../../auth.js';
import { isValidBranch } from '../../branch.js';
import { serializeUser } from '../../serializers.js';
import { ensureRolesSeeded, resolveUserRole } from '../../roleSeed.js';

interface UpdateStaffBody {
  roleId?: string;
  branchId?: string | null;
  creditLimit?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'PATCH') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleRemove(req, res);
  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'staff:edit');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing staff id' });

  await connectToDatabase();
  const member = (await User.findOne({ _id: id, role: 'tenant', clientId: session.clientId }).lean()) as UserDoc | null;
  if (!member) return res.status(404).json({ error: 'Staff member not found' });

  const roles = await ensureRolesSeeded(session.clientId);
  const currentRole = await resolveUserRole(member, roles);

  const { roleId, branchId, creditLimit } = (req.body ?? {}) as UpdateStaffBody;

  // Same protection as before, now keyed off the resolved Role rather than
  // a tenantRole string — a pre-existing single-login garage owner still
  // resolves to the protected Owner role and stays undemotable.
  if (currentRole.isProtectedOwner && roleId !== undefined && roleId !== currentRole._id.toString()) {
    return res.status(403).json({ error: 'The Owner’s role cannot be changed' });
  }
  if (branchId && !(await isValidBranch(session.clientId, branchId))) {
    return res.status(400).json({ error: 'Unknown branch' });
  }

  let resultingRole: RoleDoc = currentRole;
  if (roleId !== undefined && roleId !== currentRole._id.toString()) {
    const target = roles.find((r) => r._id.toString() === roleId);
    if (!target) return res.status(400).json({ error: 'Unknown role' });
    // Only ever assignable at Client-creation time, matches staff/index.ts's
    // invite guard.
    if (target.isProtectedOwner) return res.status(400).json({ error: 'The Owner role cannot be assigned here' });
    resultingRole = target;
  }

  if (resultingRole.requiresCreditLimit) {
    const resultingLimit = creditLimit !== undefined ? Number(creditLimit) : member.creditLimit ?? 0;
    if (!(resultingLimit > 0)) {
      return res.status(400).json({ error: `A positive credit limit is required for the "${resultingRole.name}" role` });
    }
  }

  const update: Record<string, unknown> = {};
  if (roleId !== undefined) update.roleId = resultingRole._id;
  if (branchId !== undefined) update.branchId = branchId || null;
  if (creditLimit !== undefined) update.creditLimit = Number(creditLimit) || 0;

  const updated = (await User.findOneAndUpdate(
    { _id: id, role: 'tenant', clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as UserDoc;

  return res.status(200).json({
    member: serializeUser(updated, undefined, {
      id: resultingRole._id.toString(),
      name: resultingRole.name,
      permissions: resultingRole.permissions,
      isOwner: resultingRole.isProtectedOwner,
    }),
  });
}

async function handleRemove(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'staff:remove');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing staff id' });

  if (id === session.sub) {
    return res.status(403).json({ error: 'You cannot remove yourself' });
  }

  await connectToDatabase();
  const member = (await User.findOne({ _id: id, role: 'tenant', clientId: session.clientId }).lean()) as UserDoc | null;
  if (!member) return res.status(404).json({ error: 'Staff member not found' });

  const roles = await ensureRolesSeeded(session.clientId);
  const memberRole = await resolveUserRole(member, roles);
  if (memberRole.isProtectedOwner) {
    return res.status(403).json({ error: 'The Owner cannot be removed' });
  }

  await User.deleteOne({ _id: id, clientId: session.clientId });
  return res.status(200).json({ ok: true });
}
