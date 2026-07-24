import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '../_lib/db';
import { Client, ClientDoc } from '../_lib/models/Client';
import { User } from '../_lib/models/User';
import { requireAuth } from '../_lib/auth';
import { serializeClient } from '../_lib/serializers';
import { computeMrr } from '../_lib/pricing';
import { generateUniqueSlug } from '../_lib/slug';

interface CreateClientBody {
  name?: string;
  contact?: string;
  email?: string;
  password?: string;
  plan?: 'Starter' | 'Professional' | 'Enterprise';
  status?: 'Active' | 'Trial' | 'Suspended';
  locations?: number;
  staff?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res, 'super')) return;

  await connectToDatabase();
  const clients = (await Client.find().sort({ createdAt: -1 }).lean()) as ClientDoc[];
  return res.status(200).json({ clients: clients.map(serializeClient) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res, 'super')) return;

  const { name, contact, email, password, plan, status, locations, staff } = (req.body ?? {}) as CreateClientBody;
  if (!name || !contact || !email || !password || !plan || !status) {
    return res.status(400).json({ error: 'name, contact, email, password, plan, and status are required' });
  }

  await connectToDatabase();
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await User.findOne({ email: normalizedEmail }).lean();
  if (existing) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  const slug = await generateUniqueSlug(name);

  const session = await mongoose.startSession();
  try {
    let created: ClientDoc | undefined;
    await session.withTransaction(async () => {
      const [client] = await Client.create(
        [
          {
            name,
            contact,
            email: normalizedEmail,
            plan,
            status,
            locations: locations ?? 1,
            staff: staff ?? 1,
            mrr: computeMrr(plan, status),
            slug,
          },
        ],
        { session }
      );
      const passwordHash = await bcrypt.hash(password, 10);
      await User.create(
        [{ name: contact, email: normalizedEmail, passwordHash, role: 'tenant', clientId: client._id, tenantRole: 'Owner' }],
        { session }
      );
      created = client.toObject() as ClientDoc;
    });

    return res.status(201).json({ client: serializeClient(created!) });
  } finally {
    await session.endSession();
  }
}
