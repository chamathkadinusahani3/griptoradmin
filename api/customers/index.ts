import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Customer, CustomerDoc } from '../_lib/models/Customer';
import { requireTenant } from '../_lib/auth';
import { serializeCustomer } from '../_lib/serializers';
import { hasAddOn } from '../_lib/entitlements';

interface CreateCustomerBody {
  name?: string;
  email?: string;
  phone?: string;
  vehicles?: string[];
  tags?: string[];
  type?: 'individual' | 'corporate';
  contactPerson?: string;
  creditLimit?: number;
  discountPct?: number;
}

/** True if this body is trying to use a corporate-only field. */
function wantsCorporateFields(body: CreateCustomerBody): boolean {
  return body.type === 'corporate' || Number(body.creditLimit) > 0 || Number(body.discountPct) > 0;
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
  const customers = (await Customer.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as CustomerDoc[];
  return res.status(200).json({ customers: customers.map(serializeCustomer) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = requireTenant(req, res);
  if (!session) return;

  const body = (req.body ?? {}) as CreateCustomerBody;
  const { name, email, phone, vehicles, tags, type, contactPerson, creditLimit, discountPct } = body;
  if (!name || !email) {
    return res.status(400).json({ error: 'name and email are required' });
  }

  await connectToDatabase();

  if (wantsCorporateFields(body) && !(await hasAddOn(session.clientId, 'gms-fleet'))) {
    return res.status(400).json({ error: 'Corporate accounts require the Fleet Management add-on' });
  }

  const customer = await Customer.create({
    clientId: session.clientId,
    name,
    email: email.toLowerCase().trim(),
    phone,
    vehicles: vehicles ?? [],
    tags: tags ?? [],
    type: type ?? 'individual',
    contactPerson,
    creditLimit: Number(creditLimit) || 0,
    discountPct: Number(discountPct) || 0,
  });

  return res.status(201).json({ customer: serializeCustomer(customer.toObject()) });
}
