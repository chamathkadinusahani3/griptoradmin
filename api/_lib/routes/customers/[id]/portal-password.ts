import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '../../../db.js';
import { Customer } from '../../../models/Customer.js';
import { requireTenantPermission } from '../../../auth.js';

// Staff-issued portal-access activation/reset — the trust boundary that
// replaces the real email verification griptoradmin has no infrastructure
// for (see Phase 7 plan). Staff already know their real customer in person,
// so this hands off a one-time plaintext password for them to relay
// directly rather than emailing a reset link that doesn't exist.
function generateTempPassword(): string {
  // 10 chars from a readable alphabet (no ambiguous 0/O/1/l), easy to read
  // aloud or write down.
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'customers:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing customer id' });

  await connectToDatabase();

  const customer = await Customer.findOne({ _id: id, clientId: session.clientId }).lean();
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  await Customer.updateOne({ _id: id, clientId: session.clientId }, { passwordHash });

  return res.status(200).json({ tempPassword });
}
