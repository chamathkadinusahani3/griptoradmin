import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '../_lib/db';
import { User, UserDoc } from '../_lib/models/User';
import { requireAuth } from '../_lib/auth';
import { serializeUser } from '../_lib/serializers';

interface InviteBody {
  email?: string;
  teamRole?: 'Owner' | 'Admin' | 'Support' | 'Billing';
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

  const { email, teamRole, password } = (req.body ?? {}) as InviteBody;
  if (!email || !teamRole || !password) {
    return res.status(400).json({ error: 'email, teamRole, and password are required' });
  }

  await connectToDatabase();
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await User.findOne({ email: normalizedEmail }).lean();
  if (existing) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const member = await User.create({
    name: nameFromEmail(normalizedEmail),
    email: normalizedEmail,
    passwordHash,
    role: 'super',
    teamRole,
    status: 'Invited',
  });

  return res.status(201).json({ member: serializeUser(member.toObject()) });
}
