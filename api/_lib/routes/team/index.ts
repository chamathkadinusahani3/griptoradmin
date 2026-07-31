import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '../../db.js';
import { User, UserDoc } from '../../models/User.js';
import { requireAuth } from '../../auth.js';
import { serializeUser } from '../../serializers.js';

const INVITABLE_ROLES = ['Admin', 'Support', 'Billing'] as const;
type InvitableTeamRole = (typeof INVITABLE_ROLES)[number];

interface InviteBody {
  name?: string;
  email?: string;
  teamRole?: InvitableTeamRole;
  password?: string;
}

function nameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .replace(/\./g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleInvite(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res, 'super')) return;

  await connectToDatabase();
  const members = (await User.find({ role: 'super' }).sort({ createdAt: 1 }).lean()) as UserDoc[];
  return res.status(200).json({ team: members.map((m) => serializeUser(m)) });
}

async function handleInvite(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res, 'super')) return;

  const { name, email, teamRole, password } = (req.body ?? {}) as InviteBody;
  if (!email || !teamRole || !password) {
    return res.status(400).json({ error: 'email, teamRole, and password are required' });
  }
  if (!INVITABLE_ROLES.includes(teamRole)) {
    // 'Owner' is deliberately not invitable — exactly one per platform,
    // assigned only at initial setup, never reassignable via this endpoint
    // (matches the tenant side's identical protected-Owner convention).
    return res.status(400).json({ error: `teamRole must be one of: ${INVITABLE_ROLES.join(', ')}` });
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

  const passwordHash = await bcrypt.hash(password, 10);
  const member = await User.create({
    name: name?.trim() || nameFromEmail(normalizedEmail),
    email: normalizedEmail,
    passwordHash,
    role: 'super',
    teamRole,
    status: 'Invited',
  });

  return res.status(201).json({ member: serializeUser(member.toObject()) });
}
