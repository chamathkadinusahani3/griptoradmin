import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '../_lib/db';
import { Client, ClientDoc } from '../_lib/models/Client';
import { User } from '../_lib/models/User';
import { applyPublicCors } from '../_lib/cors';
import { serializeClient } from '../_lib/serializers';
import { generateUniqueSlug } from '../_lib/slug';

interface RegisterBody {
  garageName?: string;
  contactName?: string;
  email?: string;
  password?: string;
  phone?: string;
  plan?: string;
}

const ALLOWED_SELF_SERVE_PLANS: Record<string, string> = { starter: 'Starter', professional: 'Professional' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyPublicCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { garageName, contactName, email, password, plan } = (req.body ?? {}) as RegisterBody;
  if (!garageName || !contactName || !email || !password) {
    return res.status(400).json({ error: 'garageName, contactName, email, and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const normalizedPlan = ALLOWED_SELF_SERVE_PLANS[(plan ?? '').toLowerCase()] ?? 'Starter';

  await connectToDatabase();
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await User.findOne({ email: normalizedEmail }).lean();
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const slug = await generateUniqueSlug(garageName);

  const session = await mongoose.startSession();
  try {
    let created: ClientDoc | undefined;
    await session.withTransaction(async () => {
      const [client] = await Client.create(
        [
          {
            name: garageName,
            contact: contactName,
            email: normalizedEmail,
            plan: normalizedPlan,
            status: 'Trial',
            locations: 1,
            staff: 1,
            mrr: 0,
            slug,
          },
        ],
        { session }
      );
      const passwordHash = await bcrypt.hash(password, 10);
      await User.create(
        [{ name: contactName, email: normalizedEmail, passwordHash, role: 'tenant', clientId: client._id, tenantRole: 'Owner' }],
        { session }
      );
      created = client.toObject() as ClientDoc;
    });

    return res.status(201).json({ client: serializeClient(created!) });
  } finally {
    await session.endSession();
  }
}
