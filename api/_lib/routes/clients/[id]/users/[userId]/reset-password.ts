import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '../../../../../db.js';
import { User, UserDoc } from '../../../../../models/User.js';
import { AuditLog } from '../../../../../models/AuditLog.js';
import { requireAuth } from '../../../../../auth.js';
import { generateTempPassword } from '../../../../../tempPassword.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireAuth(req, res, 'super');
  if (!session) return;

  const { id, userId } = req.query;
  if (typeof id !== 'string' || typeof userId !== 'string') return res.status(400).json({ error: 'Missing client or user id' });

  await connectToDatabase();
  const member = (await User.findOne({ _id: userId, role: 'tenant', clientId: id }).lean()) as UserDoc | null;
  if (!member) return res.status(404).json({ error: 'User not found' });

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  await User.updateOne({ _id: userId, clientId: id }, { passwordHash });

  const actor = (await User.findById(session.sub).select('name').lean()) as { name: string } | null;
  await AuditLog.create({
    actorId: session.sub,
    actorName: actor?.name ?? 'Unknown',
    clientId: id,
    targetUserId: userId,
    targetUserName: member.name,
    action: 'user.reset_password',
  });

  return res.status(200).json({ tempPassword });
}
