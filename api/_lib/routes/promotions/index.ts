import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Promotion, PromotionDoc } from '../../models/Promotion.js';
import { Part } from '../../models/Part.js';
import { Branch } from '../../models/Branch.js';
import { requireTenantPermission } from '../../auth.js';
import { serializePromotion } from '../../serializers.js';

const DISCOUNT_TYPES = ['percent', 'amount'] as const;
const CUSTOMER_TYPES = ['individual', 'corporate', 'retail', 'wholesale', 'dealer'] as const;

export interface PromotionBody {
  name?: string;
  startDate?: string;
  endDate?: string;
  discountType?: (typeof DISCOUNT_TYPES)[number];
  discountValue?: number;
  partIds?: string[];
  customerTypes?: string[];
  branchIds?: string[];
  minQty?: number;
  minOrderValue?: number;
  active?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'promotions:view');
  if (!session) return;

  await connectToDatabase();
  const promotions = (await Promotion.find({ clientId: session.clientId }).sort({ startDate: -1 }).lean()) as PromotionDoc[];
  return res.status(200).json({ promotions: promotions.map(serializePromotion) });
}

/** Shared validation used by both create and update — returns either the resolved fields or an error string. */
export async function validatePromotionBody(clientId: string, body: PromotionBody) {
  const { name, startDate, endDate, discountType, discountValue, partIds, customerTypes, branchIds, minQty, minOrderValue } = body;

  if (!name?.trim()) return { error: 'name is required' };
  if (!startDate || !endDate) return { error: 'startDate and endDate are required' };
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return { error: 'endDate must be a valid date on or after startDate' };
  }
  if (!discountType || !DISCOUNT_TYPES.includes(discountType)) return { error: `discountType must be one of: ${DISCOUNT_TYPES.join(', ')}` };
  if (discountValue == null || discountValue <= 0) return { error: 'discountValue must be a positive number' };
  if (discountType === 'percent' && discountValue > 100) return { error: 'A percent discountValue cannot exceed 100' };
  if (customerTypes && customerTypes.some((t) => !CUSTOMER_TYPES.includes(t as (typeof CUSTOMER_TYPES)[number]))) {
    return { error: `customerTypes must only contain: ${CUSTOMER_TYPES.join(', ')}` };
  }
  if (minQty != null && minQty < 0) return { error: 'minQty cannot be negative' };
  if (minOrderValue != null && minOrderValue < 0) return { error: 'minOrderValue cannot be negative' };

  if (partIds && partIds.length > 0) {
    const knownCount = await Part.countDocuments({ _id: { $in: partIds }, clientId });
    if (knownCount !== new Set(partIds).size) return { error: 'One or more partIds are unknown' };
  }
  if (branchIds && branchIds.length > 0) {
    const knownCount = await Branch.countDocuments({ _id: { $in: branchIds }, clientId });
    if (knownCount !== new Set(branchIds).size) return { error: 'One or more branchIds are unknown' };
  }

  return {
    fields: {
      name: name.trim(),
      startDate: start,
      endDate: end,
      discountType,
      discountValue,
      partIds: partIds ?? [],
      customerTypes: customerTypes ?? [],
      branchIds: branchIds ?? [],
      minQty: minQty ?? 0,
      minOrderValue: minOrderValue ?? 0,
    },
  };
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'promotions:manage');
  if (!session) return;

  await connectToDatabase();
  const result = await validatePromotionBody(session.clientId, (req.body ?? {}) as PromotionBody);
  if ('error' in result) return res.status(400).json({ error: result.error });

  const promotion = await Promotion.create({ clientId: session.clientId, ...result.fields, active: (req.body as PromotionBody)?.active ?? true });
  return res.status(201).json({ promotion: serializePromotion(promotion.toObject()) });
}
