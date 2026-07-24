import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../_lib/db';
import { Sale, SaleDoc } from '../_lib/models/Sale';
import { Part, PartDoc } from '../_lib/models/Part';
import { requireTenant } from '../_lib/auth';
import { resolveBranchFilter } from '../_lib/branch';
import { serializeSale } from '../_lib/serializers';

const TAX_RATE = 0.08;

interface CheckoutBody {
  items?: { partId?: string; qty?: number }[];
  branchId?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCheckout(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = requireTenant(req, res);
  if (!session) return;

  await connectToDatabase();
  const { branchId } = req.query;
  const effectiveBranchId = resolveBranchFilter(session, typeof branchId === 'string' ? branchId : undefined);
  const saleFilter: Record<string, unknown> = { clientId: session.clientId };
  if (effectiveBranchId) saleFilter.branchId = effectiveBranchId;
  const sales = (await Sale.find(saleFilter).sort({ createdAt: -1 }).lean()) as SaleDoc[];
  return res.status(200).json({ sales: sales.map(serializeSale) });
}

async function handleCheckout(req: VercelRequest, res: VercelResponse) {
  const session = requireTenant(req, res);
  if (!session) return;

  const { items, branchId: requestedBranchId } = (req.body ?? {}) as CheckoutBody;
  const branchId = resolveBranchFilter(session, requestedBranchId);
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }
  for (const line of items) {
    if (!line.partId || !line.qty || line.qty <= 0) {
      return res.status(400).json({ error: 'Each item requires a partId and a positive qty' });
    }
  }

  await connectToDatabase();

  const dbSession = await mongoose.startSession();
  try {
    let created: SaleDoc | undefined;
    await dbSession.withTransaction(async () => {
      // When a branch is given, only that branch's Part documents match —
      // the real fix for Anura's shared-global-stock gap: the same SKU at
      // two branches is two independent documents, so this is what makes
      // sure a sale actually decrements the RIGHT branch's stock.
      const partFilter: Record<string, unknown> = { _id: { $in: items.map((i) => i.partId) }, clientId: session.clientId };
      if (branchId) partFilter.branchId = branchId;
      const parts = await Part.find(partFilter).session(dbSession);
      const partById = new Map(parts.map((p) => [p._id.toString(), p]));

      const lines: { partId: mongoose.Types.ObjectId; name: string; price: number; qty: number }[] = [];
      let subtotal = 0;

      for (const item of items) {
        const part = partById.get(item.partId!) as (PartDoc & mongoose.Document) | undefined;
        if (!part) {
          throw Object.assign(new Error(`Unknown part: ${item.partId}`), { statusCode: 400 });
        }
        if (part.stock < item.qty!) {
          throw Object.assign(new Error(`Not enough stock for "${part.name}" (have ${part.stock}, requested ${item.qty})`), {
            statusCode: 400,
          });
        }
        lines.push({ partId: part._id, name: part.name, price: part.price, qty: item.qty! });
        subtotal += part.price * item.qty!;
      }

      const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
      const total = subtotal + tax;

      for (const line of lines) {
        await Part.updateOne({ _id: line.partId }, { $inc: { stock: -line.qty } }, { session: dbSession });
      }

      const [sale] = await Sale.create(
        [{ clientId: session.clientId, items: lines, subtotal, tax, total, branchId: branchId || undefined }],
        { session: dbSession }
      );
      created = sale.toObject() as SaleDoc;
    });

    return res.status(201).json({ sale: serializeSale(created!) });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'Checkout failed';
    return res.status(statusCode).json({ error: message });
  } finally {
    await dbSession.endSession();
  }
}
