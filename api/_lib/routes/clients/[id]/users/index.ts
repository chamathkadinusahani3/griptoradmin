import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '../../../../db.js';
import { User, UserDoc } from '../../../../models/User.js';
import { Role, RoleDoc } from '../../../../models/Role.js';
import { AuditLog } from '../../../../models/AuditLog.js';
import { requireAuth } from '../../../../auth.js';
import { serializeUser } from '../../../../serializers.js';
import { generateTempPassword } from '../../../../tempPassword.js';

interface CreateTenantUserBody {
  name?: string;
  email?: string;
  phone?: string;
  roleId?: string;
  status?: 'Active' | 'Invited';
  password?: string;
}

// Super-Admin-driven equivalent of api/_lib/routes/staff/index.ts, operating
// on an arbitrary tenant (:id from the URL) instead of the caller's own
// session — lives only in the GRIPTOR Admin portal (ClientDetail.tsx's
// Users tab), deliberately separate from the tenant's own Staff page.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res, 'super')) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing client id' });

  await connectToDatabase();
  const staff = (await User.find({ role: 'tenant', clientId: id }).sort({ createdAt: 1 }).lean()) as UserDoc[];
  const roles = (await Role.find({ clientId: id }).lean()) as RoleDoc[];
  const roleById = new Map(roles.map((r) => [r._id.toString(), r]));

  return res.status(200).json({
    users: staff.map((m) => {
      const role = m.roleId ? roleById.get(m.roleId.toString()) : undefined;
      return serializeUser(m, undefined, role ? { id: role._id.toString(), name: role.name, permissions: role.permissions, isOwner: role.isProtectedOwner } : null);
    }),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = requireAuth(req, res, 'super');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing client id' });

  const { name, email, phone, roleId, status, password: providedPassword } = (req.body ?? {}) as CreateTenantUserBody;
  if (!name || !email || !roleId) {
    return res.status(400).json({ error: 'name, email, and roleId are required' });
  }
  if (providedPassword !== undefined && providedPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  await connectToDatabase();

  const role = (await Role.findOne({ _id: roleId, clientId: id }).lean()) as RoleDoc | null;
  if (!role) return res.status(400).json({ error: 'Unknown role' });
  if (role.isProtectedOwner) return res.status(400).json({ error: 'The Owner role cannot be assigned here' });

  const normalizedEmail = email.toLowerCase().trim();
  // Emails are globally unique across the whole platform today (User.email
  // has a unique index) — same check as staff/index.ts's invite endpoint.
  const existing = await User.findOne({ email: normalizedEmail }).lean();
  if (existing) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  const tempPassword = providedPassword ?? generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const member = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    phone: phone?.trim() || undefined,
    passwordHash,
    role: 'tenant',
    clientId: id,
    roleId: role._id,
    status: status ?? 'Invited',
  });

  const actor = (await User.findById(session.sub).select('name').lean()) as { name: string } | null;
  await AuditLog.create({
    actorId: session.sub,
    actorName: actor?.name ?? 'Unknown',
    clientId: id,
    targetUserId: member._id,
    targetUserName: member.name,
    action: 'user.create',
    metadata: { roleName: role.name },
  });

  return res.status(201).json({
    member: serializeUser(member.toObject(), undefined, { id: role._id.toString(), name: role.name, permissions: role.permissions, isOwner: role.isProtectedOwner }),
    // Only returned when auto-generated — a caller-provided password is
    // never echoed back (they already know it).
    tempPassword: providedPassword === undefined ? tempPassword : undefined,
  });
}
