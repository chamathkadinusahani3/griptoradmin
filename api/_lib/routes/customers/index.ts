import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Vehicle, VehicleDoc } from '../../models/Vehicle.js';
import { Client } from '../../models/Client.js';
import { PriceList, PriceListDoc } from '../../models/PriceList.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeCustomer } from '../../serializers.js';
import { hasAddOn } from '../../entitlements.js';
import { findModule } from '../../moduleCatalog.js';
import { CREDIT_ELIGIBLE_CUSTOMER_TYPES } from '../../creditDiscipline.js';

type CustomerType = 'individual' | 'corporate' | 'retail' | 'wholesale' | 'dealer';

interface CreateCustomerBody {
  name?: string;
  email?: string;
  phone?: string;
  vehicles?: string[];
  tags?: string[];
  type?: CustomerType;
  contactPerson?: string;
  creditLimit?: number;
  discountPct?: number;
  creditPeriodDays?: number;
  billingAddress?: string;
  shippingAddress?: string;
  taxNumber?: string;
  defaultPriceListId?: string;
  sourceModule?: string;
}

/** True if this body is trying to use a corporate-only field. */
function wantsCorporateFields(body: CreateCustomerBody): boolean {
  return (
    (!!body.type && CREDIT_ELIGIBLE_CUSTOMER_TYPES.includes(body.type as (typeof CREDIT_ELIGIBLE_CUSTOMER_TYPES)[number])) ||
    Number(body.creditLimit) > 0 ||
    Number(body.discountPct) > 0 ||
    body.creditPeriodDays !== undefined
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'customers:view');
  if (!session) return;

  await connectToDatabase();

  // ?phone= / ?plate= power the booking form's debounced autofill lookup —
  // deliberately reusing this endpoint instead of adding a new one, same
  // "extend the existing list endpoint with query filters" convention used
  // everywhere else in this codebase.
  const { phone, plate } = req.query;
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof phone === 'string' && phone.trim()) {
    filter.phone = phone.trim();
  } else if (typeof plate === 'string' && plate.trim()) {
    const vehicles = (await Vehicle.find({
      clientId: session.clientId,
      plate: { $regex: `^${plate.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    })
      .select('customerId')
      .lean()) as VehicleDoc[];
    const customerIds = [...new Set(vehicles.map((v) => v.customerId.toString()))];
    if (customerIds.length === 0) return res.status(200).json({ customers: [] });
    filter._id = { $in: customerIds };
  }

  const customers = (await Customer.find(filter).sort({ createdAt: -1 }).lean()) as CustomerDoc[];
  const priceListIds = [...new Set(customers.map((c) => c.defaultPriceListId?.toString()).filter((v): v is string => !!v))];
  const priceLists = priceListIds.length > 0 ? ((await PriceList.find({ _id: { $in: priceListIds } }).select('name').lean()) as PriceListDoc[]) : [];
  const priceListNameById = new Map(priceLists.map((pl) => [pl._id.toString(), pl.name]));

  return res.status(200).json({
    customers: customers.map((c) => serializeCustomer(c, c.defaultPriceListId ? priceListNameById.get(c.defaultPriceListId.toString()) : undefined)),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'customers:manage');
  if (!session) return;

  const body = (req.body ?? {}) as CreateCustomerBody;
  const { name, email, phone, vehicles, tags, type, contactPerson, creditLimit, discountPct, creditPeriodDays, billingAddress, shippingAddress, taxNumber, defaultPriceListId, sourceModule } = body;
  if (!name || !email) {
    return res.status(400).json({ error: 'name and email are required' });
  }
  if (sourceModule !== undefined && !findModule(sourceModule)) {
    return res.status(400).json({ error: 'Unknown sourceModule' });
  }

  await connectToDatabase();

  if (wantsCorporateFields(body) && !(await hasAddOn(session.clientId, 'gms-fleet'))) {
    return res.status(400).json({ error: 'Corporate accounts require the Fleet Management add-on' });
  }

  let priceListName: string | undefined;
  if (defaultPriceListId) {
    const client = await Client.findById(session.clientId).select('priceListsEnabled').lean();
    if (!client?.priceListsEnabled) {
      return res.status(400).json({ error: 'Price Lists must be enabled in Settings before assigning one to a customer' });
    }
    const priceList = (await PriceList.findOne({ _id: defaultPriceListId, clientId: session.clientId }).lean()) as PriceListDoc | null;
    if (!priceList) return res.status(400).json({ error: 'Unknown price list' });
    priceListName = priceList.name;
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
    creditPeriodDays: creditPeriodDays !== undefined ? Math.max(1, Number(creditPeriodDays) || 30) : 30,
    billingAddress,
    shippingAddress,
    taxNumber,
    defaultPriceListId: defaultPriceListId || undefined,
    sourceModule,
  });

  return res.status(201).json({ customer: serializeCustomer(customer.toObject(), priceListName) });
}
