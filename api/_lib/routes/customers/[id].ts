import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeCustomer } from '../../serializers.js';
import { hasAddOn } from '../../entitlements.js';

interface UpdateCustomerBody {
  name?: string;
  phone?: string;
  tags?: string[];
  type?: 'individual' | 'corporate';
  contactPerson?: string;
  creditLimit?: number;
  discountPct?: number;
  creditPeriodDays?: number;
}

function wantsCorporateFields(body: UpdateCustomerBody): boolean {
  return body.type === 'corporate' || Number(body.creditLimit) > 0 || Number(body.discountPct) > 0 || body.creditPeriodDays !== undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'customers:manage');
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
  if (body.creditPeriodDays !== undefined) update.creditPeriodDays = Math.max(1, Number(body.creditPeriodDays) || 30);

  const customer = (await Customer.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as CustomerDoc;

  return res.status(200).json({ customer: serializeCustomer(customer) });
}
