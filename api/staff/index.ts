import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '../_lib/db';
import { User, UserDoc } from '../_lib/models/User';
import { requireTenant, requireTenantManager, TenantRole } from '../_lib/auth';
import { isValidBranch } from '../_lib/branch';
import { serializeUser } from '../_lib/serializers';

interface InviteStaffBody {
  name?: string;
  email?: string;
  password?: string;
  tenantRole?: TenantRole;
  branchId?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleInvite(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

// Any authenticated staff member can see the roster (matches
// api/team/index.ts's own list permissiveness) — only inviting/editing/
// removing is Owner/Manager-gated.
async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = requireTenant(req, res);
  if (!session) return;

  await connectToDatabase();
  const staff = (await User.find({ role: 'tenant', clientId: session.clientId }).sort({ createdAt: 1 }).lean()) as UserDoc[];
  return res.status(200).json({ staff: staff.map((m) => serializeUser(m)) });
}

async function handleInvite(req: VercelRequest, res: VercelResponse) {
  const session = requireTenantManager(req, res);
  if (!session) return;

  const { name, email, password, tenantRole, branchId } = (req.body ?? {}) as InviteStaffBody;
  if (!name || !email || !password || !tenantRole) {
    return res.status(400).json({ error: 'name, email, password, and tenantRole are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  await connectToDatabase();
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
    tenantRole,
    branchId: branchId || undefined,
    status: 'Invited',
  });

  return res.status(201).json({ member: serializeUser(member.toObject()) });
}
