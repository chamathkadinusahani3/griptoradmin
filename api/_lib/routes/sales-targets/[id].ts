import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SalesTarget, SalesTargetDoc, TARGET_PERIOD_TYPES } from '../../models/SalesTarget.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeSalesTarget } from '../../serializers.js';
import { computeActualSales } from '../../salesActuals.js';

interface UpdateTargetBody {
  periodType?: (typeof TARGET_PERIOD_TYPES)[number];
  periodStart?: string;
  periodEnd?: string;
  targetAmount?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'PATCH') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-targets:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing target id' });

  const body = (req.body ?? {}) as UpdateTargetBody;
  if (body.periodType !== undefined && !TARGET_PERIOD_TYPES.includes(body.periodType)) {
    return res.status(400).json({ error: 'Invalid periodType' });
  }
  if (body.targetAmount !== undefined && (typeof body.targetAmount !== 'number' || body.targetAmount <= 0)) {
    return res.status(400).json({ error: 'targetAmount must be a positive number' });
  }

  await connectToDatabase();

  const update: Record<string, unknown> = {};
  if (body.periodType !== undefined) update.periodType = body.periodType;
  // Same whole-day convention as handleCreate — see its comment.
  if (body.periodStart !== undefined) update.periodStart = new Date(`${body.periodStart}T00:00:00.000Z`);
  if (body.periodEnd !== undefined) update.periodEnd = new Date(`${body.periodEnd}T23:59:59.999Z`);
  if (body.targetAmount !== undefined) update.targetAmount = body.targetAmount;

  const target = (await SalesTarget.findOneAndUpdate({ _id: id, clientId: session.clientId }, update, { returnDocument: 'after' }).lean()) as SalesTargetDoc | null;
  if (!target) return res.status(404).json({ error: 'Target not found' });

  const salesperson = (await Salesperson.findOne({ _id: target.salespersonId, clientId: session.clientId }).lean()) as SalespersonDoc | null;
  const actualSales = await computeActualSales(session.clientId, target.salespersonId.toString(), new Date(target.periodStart), new Date(target.periodEnd));

  return res.status(200).json({
    target: serializeSalesTarget(target, { salespersonName: salesperson?.name, salespersonCode: salesperson?.code, actualSales }),
  });
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-targets:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing target id' });

  await connectToDatabase();
  const deleted = await SalesTarget.findOneAndDelete({ _id: id, clientId: session.clientId }).lean();
  if (!deleted) return res.status(404).json({ error: 'Target not found' });

  return res.status(204).end();
}
