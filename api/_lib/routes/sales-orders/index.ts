import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SalesOrder, SalesOrderDoc } from '../../models/SalesOrder.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Part, PartDoc } from '../../models/Part.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveBranchFilter } from '../../branch.js';
import { generateSequentialNumber } from '../../numbering.js';
import { computeTotals, getTaxRatePct, LineItemInput } from '../../accounting.js';
import { getEffectiveDiscountPct } from '../../creditDiscipline.js';
import { checkCreditExposureLimit } from '../../salesExecCredit.js';
import { serializeSalesOrder } from '../../serializers.js';

interface CreateSalesOrderBody {
  customerId?: string;
  branchId?: string;
  items?: LineItemInput[];
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sales:view');
  if (!session) return;

  await connectToDatabase();
  const orders = (await SalesOrder.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as SalesOrderDoc[];
  const customers = (await Customer.find({ clientId: session.clientId }).select('name').lean()) as CustomerDoc[];
  const nameById = new Map(customers.map((c) => [c._id.toString(), c.name]));

  return res.status(200).json({
    salesOrders: orders.map((o) => serializeSalesOrder(o, nameById.get(o.customerId.toString()))),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sales:manage');
  if (!session) return;

  const { customerId, branchId: requestedBranchId, items, notes } = (req.body ?? {}) as CreateSalesOrderBody;
  if (!customerId || !items || items.length === 0) {
    return res.status(400).json({ error: 'customerId and at least one item are required' });
  }

  await connectToDatabase();

  const customer = (await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean()) as CustomerDoc | null;
  if (!customer) return res.status(400).json({ error: 'Unknown customer' });

  const branchId = resolveBranchFilter(session, requestedBranchId);
  // `items` here identifies each line by partId (via LineItemInput's
  // `description` field, repurposed as a part reference the same way this
  // interface's `quantity`/`unitPrice` are reused verbatim) — resolved
  // against real Part documents before anything else, same "verify against
  // the actual catalog" discipline as purchase-orders/index.ts's own line
  // resolution. The catalog `name` (not the raw partId) is what actually
  // gets passed to computeTotals below and stored, so nothing downstream
  // ever sees a bare id where a description belongs.
  const partIds = items.map((i) => i.description).filter((v): v is string => !!v);
  const partFilter: Record<string, unknown> = { _id: { $in: partIds }, clientId: session.clientId };
  if (branchId) partFilter.branchId = branchId;
  const parts = (await Part.find(partFilter).lean()) as PartDoc[];
  const partById = new Map(parts.map((p) => [p._id.toString(), p]));

  const resolvedLines: { partId: string; name: string; quantity: number; unitPrice: number }[] = [];
  for (const item of items) {
    const part = partById.get(item.description ?? '');
    if (!part) return res.status(400).json({ error: `Unknown part for this branch: ${item.description}` });
    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) return res.status(400).json({ error: `Invalid quantity for "${part.name}"` });
    resolvedLines.push({ partId: part._id.toString(), name: part.name, quantity, unitPrice: Number(item.unitPrice) || part.price });
  }

  const effectiveDiscountPct = await getEffectiveDiscountPct(customer, session.clientId);
  const taxRatePct = await getTaxRatePct(session.clientId);
  // Only the computed subtotal/discount/tax/total are used from this call —
  // computeTotals' own `items` echo (keyed by description, not partId) is
  // discarded in favor of resolvedLines, which already carries the real
  // partId this schema requires.
  const { subtotal, discountPct, discountAmount, taxAmount, total } = computeTotals(
    resolvedLines.map((l) => ({ description: l.name, quantity: l.quantity, unitPrice: l.unitPrice })),
    effectiveDiscountPct,
    taxRatePct
  );

  const limitCheck = await checkCreditExposureLimit(session, customer, total);
  if (limitCheck.blocked) return res.status(400).json({ error: limitCheck.message });

  const salesOrderNumber = await generateSequentialNumber(SalesOrder, session.clientId, 'salesOrderNumber', 'salesOrder');

  const order = await SalesOrder.create({
    clientId: session.clientId,
    salesOrderNumber,
    customerId,
    branchId: branchId || undefined,
    items: resolvedLines,
    subtotal,
    discountPct,
    discountAmount,
    taxAmount,
    total,
    notes,
  });

  return res.status(201).json({ salesOrder: serializeSalesOrder(order.toObject(), customer.name) });
}
