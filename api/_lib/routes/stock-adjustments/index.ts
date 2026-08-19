import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../db.js';
import { StockAdjustment, StockAdjustmentDoc } from '../../models/StockAdjustment.js';
import { Part, PartDoc } from '../../models/Part.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeStockAdjustment } from '../../serializers.js';

const REASONS = ['Damage', 'Loss', 'Theft', 'Correction', 'Found', 'Stock count', 'Other'] as const;

interface CreateAdjustmentBody {
  partId?: string;
  delta?: number;
  reason?: (typeof REASONS)[number];
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'parts:view');
  if (!session) return;

  await connectToDatabase();
  const adjustments = (await StockAdjustment.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as StockAdjustmentDoc[];
  const partIds = [...new Set(adjustments.map((a) => a.partId.toString()))];
  const parts = (await Part.find({ _id: { $in: partIds } }).select('name').lean()) as PartDoc[];
  const partNameById = new Map(parts.map((p) => [p._id.toString(), p.name]));

  return res.status(200).json({
    adjustments: adjustments.map((a) => serializeStockAdjustment(a, partNameById.get(a.partId.toString()))),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'parts:manage');
  if (!session) return;

  const { partId, delta, reason, notes } = (req.body ?? {}) as CreateAdjustmentBody;
  if (!partId || !delta || !reason || !REASONS.includes(reason)) {
    return res.status(400).json({ error: 'partId, a non-zero delta, and a valid reason are required' });
  }

  await connectToDatabase();

  const dbSession = await mongoose.startSession();
  try {
    let created: StockAdjustmentDoc | undefined;
    let partName = '';
    await dbSession.withTransaction(async () => {
      const part = await Part.findOne({ _id: partId, clientId: session.clientId }).session(dbSession);
      if (!part) throw Object.assign(new Error('Unknown part'), { statusCode: 400 });
      const previousStock = part.stock;
      const newStock = previousStock + delta;
      if (newStock < 0) {
        throw Object.assign(new Error(`Adjustment would take stock negative (have ${previousStock}, adjusting by ${delta})`), { statusCode: 400 });
      }
      part.stock = newStock;
      await part.save({ session: dbSession });
      partName = part.name;

      const [adjustment] = await StockAdjustment.create(
        [{ clientId: session.clientId, partId, delta, previousStock, newStock, reason, notes: notes || undefined }],
        { session: dbSession }
      );
      created = adjustment.toObject() as StockAdjustmentDoc;
    });

    return res.status(201).json({ adjustment: serializeStockAdjustment(created!, partName) });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'Failed to record adjustment';
    return res.status(statusCode).json({ error: message });
  } finally {
    await dbSession.endSession();
  }
}
