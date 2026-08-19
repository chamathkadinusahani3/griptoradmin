import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../db.js';
import { StockTransfer, StockTransferDoc } from '../../models/StockTransfer.js';
import { Part, PartDoc } from '../../models/Part.js';
import { Warehouse, WarehouseDoc } from '../../models/Warehouse.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeStockTransfer } from '../../serializers.js';

interface CreateTransferBody {
  fromPartId?: string;
  toWarehouseId?: string;
  quantity?: number;
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
  const transfers = (await StockTransfer.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as StockTransferDoc[];
  const partIds = [...new Set(transfers.flatMap((t) => [t.fromPartId.toString(), t.toPartId.toString()]))];
  const warehouseIds = [...new Set(transfers.map((t) => t.toWarehouseId.toString()))];
  const [parts, warehouses] = await Promise.all([
    Part.find({ _id: { $in: partIds } }).select('name').lean() as Promise<PartDoc[]>,
    Warehouse.find({ _id: { $in: warehouseIds } }).select('name').lean() as Promise<WarehouseDoc[]>,
  ]);
  const partNameById = new Map(parts.map((p) => [p._id.toString(), p.name]));
  const warehouseNameById = new Map(warehouses.map((w) => [w._id.toString(), w.name]));

  return res.status(200).json({
    transfers: transfers.map((t) =>
      serializeStockTransfer(
        t,
        partNameById.get(t.fromPartId.toString()),
        partNameById.get(t.toPartId.toString()),
        warehouseNameById.get(t.toWarehouseId.toString())
      )
    ),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'parts:manage');
  if (!session) return;

  const { fromPartId, toWarehouseId, quantity, notes } = (req.body ?? {}) as CreateTransferBody;
  if (!fromPartId || !toWarehouseId || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'fromPartId, toWarehouseId, and a positive quantity are required' });
  }

  await connectToDatabase();

  const [fromPart, toWarehouse] = await Promise.all([
    Part.findOne({ _id: fromPartId, clientId: session.clientId }).lean() as Promise<PartDoc | null>,
    Warehouse.findOne({ _id: toWarehouseId, clientId: session.clientId }).lean() as Promise<WarehouseDoc | null>,
  ]);
  if (!fromPart) return res.status(400).json({ error: 'Unknown part' });
  if (!toWarehouse) return res.status(400).json({ error: 'Unknown warehouse' });
  if (fromPart.warehouseId?.toString() === toWarehouseId) {
    return res.status(400).json({ error: 'That part is already in this warehouse' });
  }
  if (fromPart.stock < quantity) {
    return res.status(400).json({ error: `Not enough stock (have ${fromPart.stock}, requested ${quantity})` });
  }

  const dbSession = await mongoose.startSession();
  try {
    let created: StockTransferDoc | undefined;
    let toPartId: mongoose.Types.ObjectId | undefined;
    await dbSession.withTransaction(async () => {
      // Find the matching Part at the destination warehouse (same SKU, or
      // same name if no SKU is set) — create it if this is the first time
      // any stock of this item has been in that warehouse.
      const matchFilter: Record<string, unknown> = {
        clientId: session.clientId,
        branchId: toWarehouse.branchId,
        warehouseId: toWarehouse._id,
        ...(fromPart.sku ? { sku: fromPart.sku } : { name: fromPart.name }),
      };
      const toPart = await Part.findOne(matchFilter).session(dbSession);
      if (toPart) {
        await Part.updateOne({ _id: toPart._id }, { $inc: { stock: quantity } }, { session: dbSession });
        toPartId = toPart._id;
      } else {
        const [createdPart] = await Part.create(
          [
            {
              clientId: session.clientId,
              name: fromPart.name,
              sku: fromPart.sku,
              barcode: fromPart.barcode,
              category: fromPart.category,
              stock: quantity,
              reorderAt: fromPart.reorderAt,
              price: fromPart.price,
              supplierId: fromPart.supplierId,
              branchId: toWarehouse.branchId,
              warehouseId: toWarehouse._id,
            },
          ],
          { session: dbSession }
        );
        toPartId = createdPart._id;
      }

      const updatedFrom = await Part.findOneAndUpdate(
        { _id: fromPartId, clientId: session.clientId, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
        { session: dbSession }
      );
      if (!updatedFrom) {
        throw Object.assign(new Error('Not enough stock — it may have just been sold or transferred elsewhere'), { statusCode: 400 });
      }

      const [transfer] = await StockTransfer.create(
        [{ clientId: session.clientId, fromPartId, toPartId, toWarehouseId, quantity, notes: notes || undefined }],
        { session: dbSession }
      );
      created = transfer.toObject() as StockTransferDoc;
    });

    return res.status(201).json({
      transfer: serializeStockTransfer(created!, fromPart.name, fromPart.name, toWarehouse.name),
    });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'Failed to transfer stock';
    return res.status(statusCode).json({ error: message });
  } finally {
    await dbSession.endSession();
  }
}
