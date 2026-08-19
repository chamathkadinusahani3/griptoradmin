import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../db.js';
import { StockCount, StockCountDoc } from '../../models/StockCount.js';
import { StockAdjustment } from '../../models/StockAdjustment.js';
import { Part } from '../../models/Part.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeStockCount } from '../../serializers.js';

interface UpdateStockCountBody {
  action?: 'count' | 'finalize';
  // For action: 'count' — one or more lines being entered/updated.
  lines?: { partId: string; countedQty: number }[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'parts:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing stock count id' });

  await connectToDatabase();

  const existing = (await StockCount.findOne({ _id: id, clientId: session.clientId }).lean()) as StockCountDoc | null;
  if (!existing) return res.status(404).json({ error: 'Stock count not found' });
  if (existing.status !== 'Open') return res.status(400).json({ error: 'This stock count has already been finalized' });

  const body = (req.body ?? {}) as UpdateStockCountBody;

  if (body.action === 'finalize') return handleFinalize(res, session.clientId, existing);

  if (!body.lines || body.lines.length === 0) {
    return res.status(400).json({ error: 'At least one counted line is required' });
  }

  const countedByPartId = new Map(body.lines.map((l) => [l.partId, l.countedQty]));
  const updated = (await StockCount.findOneAndUpdate(
    { _id: id, clientId: session.clientId, status: 'Open' },
    {
      lines: existing.lines.map((l) => {
        const countedQty = countedByPartId.get(l.partId.toString());
        return countedQty !== undefined ? { ...l, countedQty } : l;
      }),
    },
    { returnDocument: 'after' }
  ).lean()) as StockCountDoc;

  return res.status(200).json({ stockCount: serializeStockCount(updated) });
}

// Applies every counted line's quantity as the new source-of-truth stock —
// standard cycle-count practice: what was physically counted wins,
// regardless of what happened to the system quantity since the count
// started. Each change is also logged as a StockAdjustment (reason 'Stock
// count') so it shows up in the same audit trail as manual adjustments.
async function handleFinalize(res: VercelResponse, clientId: string, existing: StockCountDoc) {
  const linesToApply = existing.lines.filter((l) => l.countedQty !== null && l.countedQty !== undefined);
  if (linesToApply.length === 0) {
    return res.status(400).json({ error: 'No lines have been counted yet' });
  }

  const dbSession = await mongoose.startSession();
  try {
    let updated: StockCountDoc | undefined;
    await dbSession.withTransaction(async () => {
      for (const line of linesToApply) {
        const part = await Part.findOne({ _id: line.partId, clientId }).session(dbSession);
        if (!part) continue; // deleted since the count started — skip rather than fail the whole finalize
        const previousStock = part.stock;
        const newStock = line.countedQty!;
        if (newStock === previousStock) continue; // nothing actually changed for this line
        part.stock = newStock;
        await part.save({ session: dbSession });
        await StockAdjustment.create(
          [
            {
              clientId,
              partId: line.partId,
              delta: newStock - previousStock,
              previousStock,
              newStock,
              reason: 'Stock count',
              notes: `From stock count ${existing._id.toString()}`,
            },
          ],
          { session: dbSession }
        );
      }
      const count = await StockCount.findOneAndUpdate(
        { _id: existing._id, clientId, status: 'Open' },
        { status: 'Finalized', finalizedAt: new Date() },
        { session: dbSession, returnDocument: 'after' }
      );
      updated = count!.toObject() as StockCountDoc;
    });

    return res.status(200).json({ stockCount: serializeStockCount(updated!) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to finalize stock count';
    return res.status(500).json({ error: message });
  } finally {
    await dbSession.endSession();
  }
}
