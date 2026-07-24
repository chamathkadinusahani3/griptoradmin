import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Customer, CustomerDoc } from '../_lib/models/Customer';
import { requireTenant } from '../_lib/auth';
import { serializeCustomer } from '../_lib/serializers';
import { hasAddOn } from '../_lib/entitlements';

interface UpdateCustomerBody {
  name?: string;
  phone?: string;
  tags?: string[];
  type?: 'individual' | 'corporate';
  contactPerson?: string;
  creditLimit?: number;
  discountPct?: number;
}

function wantsCorporateFields(body: UpdateCustomerBody): boolean {
  return body.type === 'corporate' || Number(body.creditLimit) > 0 || Number(body.discountPct) > 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing customer id' });

  await connectToDatabase();

  const existing = (await Customer.findOne({ _id: id, clientId: session.clientId }).lean()) as CustomerDoc | null;
  if (!existing) return res.status(404).json({ error: 'Customer not found' });

  const body = (req.body ?? {}) as UpdateCustomerBody;

  if (wantsCorporateFields(body) && !(await hasAddOn(session.clientId, 'gms-fleet'))) {
    return res.status(400).json({ error: 'Corporate accounts require the Fleet Management add-on' });
  }

  const update: Record<string, unknown> = {};
  for (const key of ['name', 'phone', 'tags', 'type', 'contactPerson'] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (body.creditLimit !== undefined) update.creditLimit = Number(body.creditLimit) || 0;
  if (body.discountPct !== undefined) update.discountPct = Math.min(100, Math.max(0, Number(body.discountPct) || 0));

  const customer = (await Customer.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as CustomerDoc;

  return res.status(200).json({ customer: serializeCustomer(customer) });
}
