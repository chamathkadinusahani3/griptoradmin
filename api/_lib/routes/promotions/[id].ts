import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Promotion, PromotionDoc } from '../../models/Promotion.js';
import { requireTenantPermission } from '../../auth.js';
import { serializePromotion } from '../../serializers.js';
import { validatePromotionBody, PromotionBody } from './index.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'PATCH') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'promotions:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing promotion id' });

  await connectToDatabase();
  const body = (req.body ?? {}) as Record<string, unknown>;

  // A plain toggle-only PATCH (just `active`) skips the full-field
  // validation below — flipping a promotion off shouldn't require
  // re-submitting every other field.
  if (Object.keys(body).length === 1 && typeof body.active === 'boolean') {
    const promotion = (await Promotion.findOneAndUpdate({ _id: id, clientId: session.clientId }, { active: body.active }, { returnDocument: 'after' }).lean()) as PromotionDoc | null;
    if (!promotion) return res.status(404).json({ error: 'Promotion not found' });
    return res.status(200).json({ promotion: serializePromotion(promotion) });
  }

  const existing = (await Promotion.findOne({ _id: id, clientId: session.clientId }).lean()) as PromotionDoc | null;
  if (!existing) return res.status(404).json({ error: 'Promotion not found' });

  // Reshape the stored document back into PromotionBody's request-body shape
  // (ISO date strings, string ids) so an update omitting most fields still
  // re-validates the full merged record, not just what changed.
  const existingAsBody: PromotionBody = {
    name: existing.name,
    startDate: existing.startDate.toISOString(),
    endDate: existing.endDate.toISOString(),
    discountType: existing.discountType,
    discountValue: existing.discountValue,
    partIds: existing.partIds.map((id) => id.toString()),
    customerTypes: existing.customerTypes,
    branchIds: existing.branchIds.map((id) => id.toString()),
    minQty: existing.minQty,
    minOrderValue: existing.minOrderValue,
  };
  const merged: PromotionBody = { ...existingAsBody, ...body };
  const result = await validatePromotionBody(session.clientId, merged);
  if ('error' in result) return res.status(400).json({ error: result.error });

  const promotion = (await Promotion.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    { ...result.fields, active: typeof body.active === 'boolean' ? body.active : existing.active },
    { returnDocument: 'after' }
  ).lean()) as PromotionDoc;
  return res.status(200).json({ promotion: serializePromotion(promotion) });
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'promotions:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing promotion id' });

  await connectToDatabase();
  const deleted = await Promotion.findOneAndDelete({ _id: id, clientId: session.clientId }).lean();
  if (!deleted) return res.status(404).json({ error: 'Promotion not found' });
  return res.status(200).json({ success: true });
}
