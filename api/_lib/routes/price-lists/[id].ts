import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { PriceList, PriceListDoc } from '../../models/PriceList.js';
import { Part, PartDoc } from '../../models/Part.js';
import { Customer } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { serializePriceList } from '../../serializers.js';
import { resolveOverrides } from './index.js';

interface OverrideBody {
  partId?: string;
  price?: number;
}

interface UpdatePriceListBody {
  name?: string;
  overrides?: OverrideBody[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'PATCH') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'price-lists:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing price list id' });

  await connectToDatabase();

  const existing = (await PriceList.findOne({ _id: id, clientId: session.clientId }).lean()) as PriceListDoc | null;
  if (!existing) return res.status(404).json({ error: 'Price list not found' });

  const { name, overrides: rawOverrides } = (req.body ?? {}) as UpdatePriceListBody;
  const update: Record<string, unknown> = {};
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'name cannot be empty' });
    update.name = name.trim();
  }
  // A full replace, not a merge — same "the client sends the whole list,
  // matching how deliveryLoadRules/numberingPrefixes are edited" convention
  // used elsewhere for a small array-of-settings field.
  if (rawOverrides !== undefined) {
    const resolved = await resolveOverrides(session.clientId, rawOverrides);
    if ('error' in resolved) return res.status(400).json({ error: resolved.error });
    update.overrides = resolved.overrides;
  }
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'No changes provided' });

  const priceList = (await PriceList.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as PriceListDoc;

  const partIds = priceList.overrides.map((o) => o.partId.toString());
  const parts = partIds.length > 0 ? ((await Part.find({ _id: { $in: partIds }, clientId: session.clientId }).select('name').lean()) as PartDoc[]) : [];
  const partNameById = new Map(parts.map((p) => [p._id.toString(), p.name]));

  return res.status(200).json({ priceList: serializePriceList(priceList, partNameById) });
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'price-lists:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing price list id' });

  await connectToDatabase();

  const existing = await PriceList.findOne({ _id: id, clientId: session.clientId }).lean();
  if (!existing) return res.status(404).json({ error: 'Price list not found' });

  const inUse = await Customer.exists({ clientId: session.clientId, defaultPriceListId: id });
  if (inUse) return res.status(400).json({ error: 'This price list is still assigned to at least one customer — unassign it first' });

  await PriceList.deleteOne({ _id: id, clientId: session.clientId });
  return res.status(200).json({ success: true });
}
