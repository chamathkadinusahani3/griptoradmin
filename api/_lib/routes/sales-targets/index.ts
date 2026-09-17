import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SalesTarget, SalesTargetDoc, TARGET_PERIOD_TYPES } from '../../models/SalesTarget.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeSalesTarget } from '../../serializers.js';
import { computeActualSales } from '../../salesActuals.js';

interface CreateTargetBody {
  salespersonId?: string;
  periodType?: (typeof TARGET_PERIOD_TYPES)[number];
  periodStart?: string;
  periodEnd?: string;
  targetAmount?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-targets:view');
  if (!session) return;

  const { salespersonId } = req.query;

  await connectToDatabase();
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof salespersonId === 'string') filter.salespersonId = salespersonId;

  const targets = (await SalesTarget.find(filter).sort({ periodStart: -1 }).lean()) as SalesTargetDoc[];
  if (targets.length === 0) return res.status(200).json({ targets: [] });

  const salespersonIds = [...new Set(targets.map((t) => t.salespersonId.toString()))];
  const salespersons = (await Salesperson.find({ _id: { $in: salespersonIds }, clientId: session.clientId }).lean()) as SalespersonDoc[];
  const spById = new Map(salespersons.map((s) => [s._id.toString(), s]));

  const serialized = await Promise.all(
    targets.map(async (t) => {
      const actualSales = await computeActualSales(session.clientId, t.salespersonId.toString(), new Date(t.periodStart), new Date(t.periodEnd));
      const sp = spById.get(t.salespersonId.toString());
      return serializeSalesTarget(t, { salespersonName: sp?.name, salespersonCode: sp?.code, actualSales });
    })
  );

  return res.status(200).json({ targets: serialized });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-targets:manage');
  if (!session) return;

  const body = (req.body ?? {}) as CreateTargetBody;
  if (!body.salespersonId || !body.periodType || !body.periodStart || !body.periodEnd || body.targetAmount == null) {
    return res.status(400).json({ error: 'salespersonId, periodType, periodStart, periodEnd, and targetAmount are required' });
  }
  if (!TARGET_PERIOD_TYPES.includes(body.periodType)) {
    return res.status(400).json({ error: 'Invalid periodType' });
  }
  // Same `T00:00:00.000Z`/`T23:59:59.999Z` convention as resolveReportRange
  // (reportRange.ts) — a plain "YYYY-MM-DD" date must cover the WHOLE day,
  // not the single midnight instant `new Date(dateString)` alone would give,
  // or a same-day range would incorrectly match zero actual sales.
  const periodStart = new Date(`${body.periodStart}T00:00:00.000Z`);
  const periodEnd = new Date(`${body.periodEnd}T23:59:59.999Z`);
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodEnd < periodStart) {
    return res.status(400).json({ error: 'Invalid period range' });
  }
  if (typeof body.targetAmount !== 'number' || body.targetAmount <= 0) {
    return res.status(400).json({ error: 'targetAmount must be a positive number' });
  }

  await connectToDatabase();

  const salesperson = (await Salesperson.findOne({ _id: body.salespersonId, clientId: session.clientId }).lean()) as SalespersonDoc | null;
  if (!salesperson) return res.status(400).json({ error: 'Salesperson not found' });

  const target = await SalesTarget.create({
    clientId: session.clientId,
    salespersonId: body.salespersonId,
    periodType: body.periodType,
    periodStart,
    periodEnd,
    targetAmount: body.targetAmount,
  });

  const actualSales = await computeActualSales(session.clientId, body.salespersonId, periodStart, periodEnd);
  return res.status(201).json({
    target: serializeSalesTarget(target.toObject(), { salespersonName: salesperson.name, salespersonCode: salesperson.code, actualSales }),
  });
}
