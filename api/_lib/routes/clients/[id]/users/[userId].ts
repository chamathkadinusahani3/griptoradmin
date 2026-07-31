import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../../db.js';
import { User, UserDoc } from '../../../../models/User.js';
import { Role, RoleDoc } from '../../../../models/Role.js';
import { AuditLog } from '../../../../models/AuditLog.js';
import { requireAuth } from '../../../../auth.js';
import { serializeUser } from '../../../../serializers.js';
import { ensureRolesSeeded, resolveUserRole } from '../../../../roleSeed.js';
import { isValidPermission } from '../../../../permissions.js';

interface UpdateTenantUserBody {
  name?: string;
  email?: string;
  phone?: string;
  roleId?: string;
  status?: 'Active' | 'Invited' | 'Deactivated';
  // undefined = leave untouched; null = clear the override (revert to the
  // role's permissions); an array = set/replace the override.
  permissionOverrides?: string[] | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'PATCH') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleRemove(req, res);
  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  const session = requireAuth(req, res, 'super');
  if (!session) return;

  const { id, userId } = req.query;
  if (typeof id !== 'string' || typeof userId !== 'string') return res.status(400).json({ error: 'Missing client or user id' });

  await connectToDatabase();
  const member = (await User.findOne({ _id: userId, role: 'tenant', clientId: id }).lean()) as UserDoc | null;
  if (!member) return res.status(404).json({ error: 'User not found' });

  const roles = await ensureRolesSeeded(id);
  const currentRole = await resolveUserRole(member, roles);

  const { name, email, phone, roleId, status, permissionOverrides } = (req.body ?? {}) as UpdateTenantUserBody;

  if (currentRole.isProtectedOwner && roleId !== undefined && roleId !== currentRole._id.toString()) {
    return res.status(403).json({ error: 'The Owner’s role cannot be changed' });
  }

  if (permissionOverrides !== undefined) {
    if (currentRole.isProtectedOwner) {
      return res.status(400).json({ error: 'The Owner already has full access and cannot be limited' });
    }
    if (permissionOverrides !== null) {
      const invalid = permissionOverrides.filter((p) => !isValidPermission(p));
      if (invalid.length > 0) return res.status(400).json({ error: `Unknown permission(s): ${invalid.join(', ')}` });
    }
  }

  let resultingRole: RoleDoc = currentRole;
  if (roleId !== undefined && roleId !== currentRole._id.toString()) {
    const target = roles.find((r) => r._id.toString() === roleId);
    if (!target) return res.status(400).json({ error: 'Unknown role' });
    if (target.isProtectedOwner) return res.status(400).json({ error: 'The Owner role cannot be assigned here' });
    resultingRole = target;
  }

  if (email !== undefined) {
    const normalizedEmail = email.toLowerCase().trim();
    if (normalizedEmail !== member.email) {
      const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: userId } }).lean();
      if (existing) return res.status(409).json({ error: 'A user with this email already exists' });
    }
  }

  const update: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  if (name !== undefined) update.name = name.trim();
  if (email !== undefined) update.email = email.toLowerCase().trim();
  if (phone !== undefined) update.phone = phone.trim() || undefined;
  if (roleId !== undefined) update.roleId = resultingRole._id;
  if (status !== undefined) update.status = status;
  if (permissionOverrides !== undefined) {
    if (permissionOverrides === null) unset.permissionOverrides = 1;
    else update.permissionOverrides = permissionOverrides;
  }

  const updateOp: Record<string, unknown> = {
    ...(Object.keys(update).length > 0 ? { $set: update } : {}),
    ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
  };

  const updated = (await User.findOneAndUpdate(
    { _id: userId, role: 'tenant', clientId: id },
    updateOp,
    { returnDocument: 'after' }
  ).lean()) as UserDoc;

  let action: 'user.activate' | 'user.deactivate' | 'user.update' = 'user.update';
  if (status !== undefined && status !== member.status) {
    if (status === 'Deactivated') action = 'user.deactivate';
    else if (member.status === 'Deactivated') action = 'user.activate';
  }

  const actor = (await User.findById(session.sub).select('name').lean()) as { name: string } | null;
  await AuditLog.create({
    actorId: session.sub,
    actorName: actor?.name ?? 'Unknown',
    clientId: id,
    targetUserId: userId,
    targetUserName: updated.name,
    action,
    metadata: { changedFields: [...Object.keys(update), ...Object.keys(unset)] },
  });

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
  const session = requireAuth(req, res, 'super');
  if (!session) return;

  const { id, userId } = req.query;
  if (typeof id !== 'string' || typeof userId !== 'string') return res.status(400).json({ error: 'Missing client or user id' });

  await connectToDatabase();
  const member = (await User.findOne({ _id: userId, role: 'tenant', clientId: id }).lean()) as UserDoc | null;
  if (!member) return res.status(404).json({ error: 'User not found' });

  const roles = await ensureRolesSeeded(id);
  const role = await resolveUserRole(member, roles);
  if (role.isProtectedOwner) {
    return res.status(403).json({ error: 'The Owner cannot be removed' });
  }

  await User.deleteOne({ _id: userId, clientId: id });

  const actor = (await User.findById(session.sub).select('name').lean()) as { name: string } | null;
  await AuditLog.create({
    actorId: session.sub,
    actorName: actor?.name ?? 'Unknown',
    clientId: id,
    targetUserId: userId,
    targetUserName: member.name,
    action: 'user.delete',
  });

  return res.status(200).json({ ok: true });
}
