import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { PurchaseRequisition, PurchaseRequisitionDoc } from '../../models/PurchaseRequisition.js';
import { User, UserDoc } from '../../models/User.js';
import { requireTenantPermission } from '../../auth.js';
import { generateSequentialNumber } from '../../numbering.js';
import { serializePurchaseRequisition } from '../../serializers.js';

interface RequisitionLineInput {
  partId?: string;
  name?: string;
  quantity?: number;
  estimatedUnitCost?: number;
}

interface CreateRequisitionBody {
  items?: RequisitionLineInput[];
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'purchase-orders:view');
  if (!session) return;

  await connectToDatabase();
  const requisitions = (await PurchaseRequisition.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as PurchaseRequisitionDoc[];
  const userIds = [...new Set(requisitions.flatMap((r) => [r.requestedBy.toString(), r.reviewedBy?.toString()].filter(Boolean) as string[]))];
  const users = (await User.find({ _id: { $in: userIds } }).select('name').lean()) as UserDoc[];
  const nameById = new Map(users.map((u) => [u._id.toString(), u.name]));

  return res.status(200).json({
    requisitions: requisitions.map((r) =>
      serializePurchaseRequisition(r, nameById.get(r.requestedBy.toString()), r.reviewedBy ? nameById.get(r.reviewedBy.toString()) : undefined)
    ),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'purchase-orders:manage');
  if (!session) return;

  const { items, notes } = (req.body ?? {}) as CreateRequisitionBody;
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }
  for (const line of items) {
    if (!line.name || !line.quantity || line.quantity <= 0) {
      return res.status(400).json({ error: 'Each item requires a name and a positive quantity' });
    }
  }

  await connectToDatabase();

  const lines = items.map((i) => ({
    partId: i.partId || undefined,
    name: i.name!,
    quantity: i.quantity!,
    estimatedUnitCost: i.estimatedUnitCost,
  }));
  const estimatedTotal = Math.round(lines.reduce((sum, l) => sum + l.quantity * (l.estimatedUnitCost ?? 0), 0) * 100) / 100;

  const requisitionNumber = await generateSequentialNumber(PurchaseRequisition, session.clientId, 'requisitionNumber', 'purchaseRequisition');

  const requisition = await PurchaseRequisition.create({
    clientId: session.clientId,
    requisitionNumber,
    requestedBy: session.sub,
    items: lines,
    estimatedTotal,
    notes,
  });

  const requester = (await User.findById(session.sub).select('name').lean()) as { name: string } | null;
  return res.status(201).json({ requisition: serializePurchaseRequisition(requisition.toObject(), requester?.name) });
}
