import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../db.js';
import { Role, RoleDoc } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { requireTenant, requireTenantPermission } from '../../auth.js';
import { serializeRole } from '../../serializers.js';
import { isValidPermission } from '../../permissions.js';
import { ensureRolesSeeded } from '../../roleSeed.js';

interface CreateRoleBody {
  name?: string;
  permissions?: string[];
  branchPinned?: boolean;
  requiresCreditLimit?: boolean;
}

// Any authenticated staff member can see the role list (needed for the
// Staff.tsx role picker and for badge display) — only creating/editing/
// deleting roles requires roles:manage.
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
  const roles = await ensureRolesSeeded(session.clientId);
  // Unlike .find(), an aggregation $match is NOT schema-aware — Mongoose
  // never auto-casts session.clientId (a plain string from the JWT) to the
  // real ObjectId the field is stored as, so a bare string here would
  // silently match nothing. Cast explicitly.
  const counts = await User.aggregate([
    { $match: { clientId: new mongoose.Types.ObjectId(session.clientId), role: 'tenant' } },
    { $group: { _id: '$roleId', count: { $sum: 1 } } },
  ]);
  const countByRoleId = new Map(counts.map((c) => [c._id?.toString(), c.count as number]));

  return res.status(200).json({
    roles: roles.map((r) => ({ ...serializeRole(r), memberCount: countByRoleId.get(r._id.toString()) ?? 0 })),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'roles:manage');
  if (!session) return;

  const { name, permissions, branchPinned, requiresCreditLimit } = (req.body ?? {}) as CreateRoleBody;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

  const invalid = (permissions ?? []).filter((p) => !isValidPermission(p));
  if (invalid.length > 0) return res.status(400).json({ error: `Unknown permission(s): ${invalid.join(', ')}` });

  await connectToDatabase();

  const existing = await Role.findOne({ clientId: session.clientId, name: name.trim() }).lean();
  if (existing) return res.status(409).json({ error: 'A role with this name already exists' });

  const role = await Role.create({
    clientId: session.clientId,
    name: name.trim(),
    isProtectedOwner: false,
    permissions: permissions ?? [],
    branchPinned: !!branchPinned,
    requiresCreditLimit: !!requiresCreditLimit,
  });

  return res.status(201).json({ role: serializeRole(role.toObject() as RoleDoc) });
}
