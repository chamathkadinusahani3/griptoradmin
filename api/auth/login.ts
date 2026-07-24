import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '../_lib/db';
import { User, UserDoc } from '../_lib/models/User';
import { Client, ClientDoc } from '../_lib/models/Client';
import { signSession, setSessionCookie } from '../_lib/auth';
import { serializeUser } from '../_lib/serializers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  await connectToDatabase();

  const user = (await User.findOne({ email: email.toLowerCase().trim() }).lean()) as UserDoc | null;
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const client = user.clientId
    ? ((await Client.findById(user.clientId).lean()) as ClientDoc | null)
    : null;

  if (user.status === 'Invited') {
    await User.updateOne({ _id: user._id }, { status: 'Active' });
    user.status = 'Active';
  }

  const token = signSession({
    sub: user._id.toString(),
    role: user.role as 'super' | 'tenant',
    clientId: user.clientId?.toString(),
    // Defaults every pre-existing single-login garage owner to real Owner
    // access with zero migration — same backfill-at-read discipline as
    // serializeUser below.
    tenantRole: user.role === 'tenant' ? (user.tenantRole as 'Owner' | 'Manager' | 'Technician' | 'Cashier' | undefined) ?? 'Owner' : undefined,
    branchId: user.branchId?.toString(),
  });
  setSessionCookie(res, token);

  return res.status(200).json({ user: serializeUser(user, client) });
}
