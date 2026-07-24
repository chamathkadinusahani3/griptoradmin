import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Supplier, SupplierDoc } from '../_lib/models/Supplier';
import { requireTenant } from '../_lib/auth';
import { serializeSupplier } from '../_lib/serializers';

interface CreateSupplierBody {
  name?: string;
  contact?: string;
  email?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = requireTenant(req, res);
  if (!session) return;

  await connectToDatabase();
  const suppliers = (await Supplier.find({ clientId: session.clientId }).sort({ createdAt: 1 }).lean()) as SupplierDoc[];
  return res.status(200).json({ suppliers: suppliers.map(serializeSupplier) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = requireTenant(req, res);
  if (!session) return;

  const { name, contact, email } = (req.body ?? {}) as CreateSupplierBody;
  if (!name) return res.status(400).json({ error: 'name is required' });

  await connectToDatabase();
  const supplier = await Supplier.create({ clientId: session.clientId, name, contact, email });

  return res.status(201).json({ supplier: serializeSupplier(supplier.toObject()) });
}
