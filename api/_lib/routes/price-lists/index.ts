import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { PriceList, PriceListDoc } from '../../models/PriceList.js';
import { Part, PartDoc } from '../../models/Part.js';
import { requireTenantPermission } from '../../auth.js';
import { serializePriceList } from '../../serializers.js';

interface OverrideBody {
  partId?: string;
  price?: number;
}

interface CreatePriceListBody {
  name?: string;
  overrides?: OverrideBody[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function withPartNames(clientId: string, priceLists: PriceListDoc[]) {
  const partIds = [...new Set(priceLists.flatMap((pl) => pl.overrides.map((o) => o.partId.toString())))];
  const parts = partIds.length > 0 ? ((await Part.find({ _id: { $in: partIds }, clientId }).select('name').lean()) as PartDoc[]) : [];
  const partNameById = new Map(parts.map((p) => [p._id.toString(), p.name]));
  return priceLists.map((pl) => serializePriceList(pl, partNameById));
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'price-lists:view');
  if (!session) return;

  await connectToDatabase();
  const priceLists = (await PriceList.find({ clientId: session.clientId }).sort({ name: 1 }).lean()) as PriceListDoc[];
  return res.status(200).json({ priceLists: await withPartNames(session.clientId, priceLists) });
}

/** Validates + normalizes a raw overrides array against the tenant's real Part catalog — shared by create and [id].ts's replace-overrides update. */
export async function resolveOverrides(clientId: string, raw: OverrideBody[]): Promise<{ error: string } | { overrides: { partId: string; price: number }[] }> {
  const partIds = raw.map((o) => o.partId).filter((v): v is string => !!v);
  const parts = (await Part.find({ _id: { $in: partIds }, clientId }).select('_id').lean()) as { _id: { toString(): string } }[];
  const knownPartIds = new Set(parts.map((p) => p._id.toString()));

  const overrides: { partId: string; price: number }[] = [];
  const seen = new Set<string>();
  for (const o of raw) {
    if (!o.partId || !knownPartIds.has(o.partId)) return { error: `Unknown part in overrides: ${o.partId}` };
    if (o.price == null || o.price < 0) return { error: 'Each override needs a non-negative price' };
    if (seen.has(o.partId)) return { error: 'Each part can only appear once in a price list' };
    seen.add(o.partId);
    overrides.push({ partId: o.partId, price: o.price });
  }
  return { overrides };
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'price-lists:manage');
  if (!session) return;

  const { name, overrides: rawOverrides } = (req.body ?? {}) as CreatePriceListBody;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  await connectToDatabase();

  const resolved = await resolveOverrides(session.clientId, rawOverrides ?? []);
  if ('error' in resolved) return res.status(400).json({ error: resolved.error });

  const priceList = await PriceList.create({ clientId: session.clientId, name: name.trim(), overrides: resolved.overrides });
  const [serialized] = await withPartNames(session.clientId, [priceList.toObject() as PriceListDoc]);
  return res.status(201).json({ priceList: serialized });
}
