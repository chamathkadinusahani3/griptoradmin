import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Role, RoleDoc } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeRole } from '../../serializers.js';
import { isValidPermission } from '../../permissions.js';

interface UpdateRoleBody {
  name?: string;
  permissions?: string[];
  branchPinned?: boolean;
  requiresCreditLimit?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'PATCH') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleRemove(req, res);
  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'roles:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing role id' });

  await connectToDatabase();
  const existing = (await Role.findOne({ _id: id, clientId: session.clientId }).lean()) as RoleDoc | null;
  if (!existing) return res.status(404).json({ error: 'Role not found' });
  // Immutable — an Owner's access is always the isOwner short-circuit
  // (never a materialized permission list), so there's nothing meaningful
  // to edit here, and it must stay assignable only at Client-creation time.
  if (existing.isProtectedOwner) return res.status(400).json({ error: 'The Owner role cannot be edited' });

  const { name, permissions, branchPinned, requiresCreditLimit } = (req.body ?? {}) as UpdateRoleBody;
  if (name !== undefined && !name.trim()) return res.status(400).json({ error: 'name cannot be empty' });
  if (permissions !== undefined) {
    const invalid = permissions.filter((p) => !isValidPermission(p));
    if (invalid.length > 0) return res.status(400).json({ error: `Unknown permission(s): ${invalid.join(', ')}` });
  }

  if (name !== undefined && name.trim() !== existing.name) {
    const nameTaken = await Role.findOne({ clientId: session.clientId, name: name.trim(), _id: { $ne: id } }).lean();
    if (nameTaken) return res.status(409).json({ error: 'A role with this name already exists' });
  }

  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name.trim();
  if (permissions !== undefined) update.permissions = permissions;
  if (branchPinned !== undefined) update.branchPinned = branchPinned;
  if (requiresCreditLimit !== undefined) update.requiresCreditLimit = requiresCreditLimit;

  const role = (await Role.findOneAndUpdate({ _id: id, clientId: session.clientId }, update, {
    returnDocument: 'after',
  }).lean()) as RoleDoc;

  return res.status(200).json({ role: serializeRole(role) });
}

async function handleRemove(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'roles:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing role id' });

  await connectToDatabase();
  const existing = (await Role.findOne({ _id: id, clientId: session.clientId }).lean()) as RoleDoc | null;
  if (!existing) return res.status(404).json({ error: 'Role not found' });
  if (existing.isProtectedOwner) return res.status(400).json({ error: 'The Owner role cannot be deleted' });

  // Same in-use delete guard as pricing-tiers/[tierId].ts's plan-assignment check.
  const assignedCount = await User.countDocuments({ roleId: id });
  if (assignedCount > 0) {
    return res.status(409).json({ error: `${assignedCount} staff member(s) are assigned to this role — reassign them first` });
  }

  await Role.deleteOne({ _id: id, clientId: session.clientId });
  return res.status(200).json({ ok: true });
}
