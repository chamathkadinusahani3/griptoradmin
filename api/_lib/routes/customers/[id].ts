import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Client } from '../../models/Client.js';
import { PriceList, PriceListDoc } from '../../models/PriceList.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeCustomer } from '../../serializers.js';
import { hasAddOn } from '../../entitlements.js';
import { CREDIT_ELIGIBLE_CUSTOMER_TYPES } from '../../creditDiscipline.js';

type CustomerType = 'individual' | 'corporate' | 'retail' | 'wholesale' | 'dealer';

interface UpdateCustomerBody {
  name?: string;
  phone?: string;
  tags?: string[];
  type?: CustomerType;
  contactPerson?: string;
  creditLimit?: number;
  discountPct?: number;
  creditPeriodDays?: number;
  billingAddress?: string;
  shippingAddress?: string;
  taxNumber?: string;
  status?: 'Active' | 'Inactive' | 'Blocked';
  defaultPriceListId?: string | null;
}

function wantsCorporateFields(body: UpdateCustomerBody): boolean {
  return (
    (!!body.type && CREDIT_ELIGIBLE_CUSTOMER_TYPES.includes(body.type as (typeof CREDIT_ELIGIBLE_CUSTOMER_TYPES)[number])) ||
    Number(body.creditLimit) > 0 ||
    Number(body.discountPct) > 0 ||
    body.creditPeriodDays !== undefined
  );
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
  for (const key of ['name', 'phone', 'tags', 'type', 'contactPerson', 'billingAddress', 'shippingAddress', 'taxNumber', 'status'] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (body.creditLimit !== undefined) update.creditLimit = Number(body.creditLimit) || 0;
  if (body.discountPct !== undefined) update.discountPct = Math.min(100, Math.max(0, Number(body.discountPct) || 0));
  if (body.creditPeriodDays !== undefined) update.creditPeriodDays = Math.max(1, Number(body.creditPeriodDays) || 30);

  let priceListName: string | undefined;
  let unassignPriceList = false;
  if (body.defaultPriceListId !== undefined) {
    if (!body.defaultPriceListId) {
      // Unassigning is always allowed, no gate needed to remove one. Plain
      // `undefined` in a non-$set-wrapped update object gets silently
      // dropped by Mongoose rather than clearing the field, so this needs a
      // real $unset.
      unassignPriceList = true;
    } else {
      const client = await Client.findById(session.clientId).select('priceListsEnabled').lean();
      if (!client?.priceListsEnabled) {
        return res.status(400).json({ error: 'Price Lists must be enabled in Settings before assigning one to a customer' });
      }
      const priceList = (await PriceList.findOne({ _id: body.defaultPriceListId, clientId: session.clientId }).lean()) as PriceListDoc | null;
      if (!priceList) return res.status(400).json({ error: 'Unknown price list' });
      update.defaultPriceListId = body.defaultPriceListId;
      priceListName = priceList.name;
    }
  }

  const customer = (await Customer.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    unassignPriceList ? { $set: update, $unset: { defaultPriceListId: '' } } : update,
    { returnDocument: 'after' }
  ).lean()) as CustomerDoc;

  return res.status(200).json({ customer: serializeCustomer(customer, priceListName) });
}
