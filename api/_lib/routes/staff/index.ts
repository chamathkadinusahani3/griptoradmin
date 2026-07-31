import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '../../db.js';
import { User, UserDoc } from '../../models/User.js';
import { Role, RoleDoc } from '../../models/Role.js';
import { requireTenant, requireTenantPermission } from '../../auth.js';
import { isValidBranch } from '../../branch.js';
import { serializeUser } from '../../serializers.js';

interface InviteStaffBody {
  name?: string;
  email?: string;
  password?: string;
  roleId?: string;
  branchId?: string;
  creditLimit?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleInvite(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

// Any authenticated staff member can see the roster (matches
// api/team/index.ts's own list permissiveness) — only inviting/editing/
// removing requires the staff:invite/staff:edit/staff:remove permission.
async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = requireTenant(req, res);
  if (!session) return;

  await connectToDatabase();
  const staff = (await User.find({ role: 'tenant', clientId: session.clientId }).sort({ createdAt: 1 }).lean()) as UserDoc[];
  const roles = (await Role.find({ clientId: session.clientId }).lean()) as RoleDoc[];
  const roleById = new Map(roles.map((r) => [r._id.toString(), r]));

  return res.status(200).json({
    staff: staff.map((m) => {
      const role = m.roleId ? roleById.get(m.roleId.toString()) : undefined;
      return serializeUser(m, undefined, role ? { id: role._id.toString(), name: role.name, permissions: role.permissions, isOwner: role.isProtectedOwner } : null);
    }),
  });
}

async function handleInvite(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'staff:invite');
  if (!session) return;

  const { name, email, password, roleId, branchId, creditLimit } = (req.body ?? {}) as InviteStaffBody;
  if (!name || !email || !password || !roleId) {
    return res.status(400).json({ error: 'name, email, password, and roleId are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  await connectToDatabase();

  const role = (await Role.findOne({ _id: roleId, clientId: session.clientId }).lean()) as RoleDoc | null;
  if (!role) return res.status(400).json({ error: 'Unknown role' });
  // The protected Owner role is only ever assigned at Client-creation time
  // (tenants/register.ts, clients/index.ts) — matches today's real
  // behavior, where the invite form never offered "Owner" as an option.
  if (role.isProtectedOwner) return res.status(400).json({ error: 'The Owner role cannot be assigned here' });
  if (role.requiresCreditLimit && !(Number(creditLimit) > 0)) {
    return res.status(400).json({ error: `A positive credit limit is required for the "${role.name}" role` });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const existing = await User.findOne({ email: normalizedEmail }).lean();
  if (existing) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }
  if (branchId && !(await isValidBranch(session.clientId, branchId))) {
    return res.status(400).json({ error: 'Unknown branch' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const member = await User.create({
    name,
    email: normalizedEmail,
    passwordHash,
    role: 'tenant',
    clientId: session.clientId,
    roleId: role._id,
    branchId: branchId || undefined,
    creditLimit: role.requiresCreditLimit ? Number(creditLimit) : 0,
    status: 'Invited',
  });

  return res.status(201).json({
    member: serializeUser(member.toObject(), undefined, { id: role._id.toString(), name: role.name, permissions: role.permissions, isOwner: role.isProtectedOwner }),
  });
}
