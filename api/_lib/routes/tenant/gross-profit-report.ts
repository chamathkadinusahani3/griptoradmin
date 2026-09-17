import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Sale, SaleDoc } from '../../models/Sale.js';
import { SalesOrder, SalesOrderDoc } from '../../models/SalesOrder.js';
import { Part, PartDoc } from '../../models/Part.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';

const DIMENSIONS = ['product', 'customer', 'salesperson'] as const;
type Dimension = (typeof DIMENSIONS)[number];
const round2 = (n: number) => Math.round(n * 100) / 100;

// Sales Module Phase 13 — one report, three groupings. Cost-basis
// availability differs sharply by document, so each dimension pulls from
// whichever document actually HAS the cost data it needs:
//
// product: Sale.items only (POS checkout AND every fulfilled Sales Order —
// see sales-report.ts's comment). Sale's line shape ({partId, name, price,
// qty}) never snapshots a per-line cost, so COGS here is approximated using
// the PART'S CURRENT cost, not the cost at the moment of that historical
// sale — the best available number, explicitly labeled as an approximation
// in the response and in the UI, same "known limitation, not a bug"
// documentation discipline used elsewhere in this codebase.
//
// customer/salesperson: SalesOrder lines only, which DO snapshot a real
// unitCost per line at order time — accurate margin, not an approximation.
// CustomerInvoice is excluded entirely from every dimension here: its lines
// are free-text {description, quantity, unitPrice} with no partId and no
// cost basis at all (the same structural gap already documented in Phase 6
// and Phase 7 of this roadmap), so there is nothing to compute a margin
// against.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  const dimension = (typeof req.query.dimension === 'string' ? req.query.dimension : 'product') as Dimension;
  if (!DIMENSIONS.includes(dimension)) {
    return res.status(400).json({ error: `dimension must be one of: ${DIMENSIONS.join(', ')}` });
  }

  const { from, to } = resolveReportRange(req);
  const clientId = session.clientId;
  await connectToDatabase();

  if (dimension === 'product') {
    const sales = (await Sale.find({ clientId, createdAt: { $gte: from, $lte: to } }).lean()) as SaleDoc[];
    const partIds = [...new Set(sales.flatMap((s) => s.items.map((i) => i.partId.toString())))];
    const parts = partIds.length ? ((await Part.find({ _id: { $in: partIds }, clientId }).select('name cost').lean()) as PartDoc[]) : [];
    const costById = new Map(parts.map((p) => [p._id.toString(), p.cost ?? 0]));

    const totalsById = new Map<string, { name: string; revenue: number; cogs: number; qty: number }>();
    for (const sale of sales) {
      for (const line of sale.items) {
        const key = line.partId.toString();
        const agg = totalsById.get(key) ?? { name: line.name, revenue: 0, cogs: 0, qty: 0 };
        agg.revenue += line.price * line.qty;
        agg.cogs += (costById.get(key) ?? 0) * line.qty;
        agg.qty += line.qty;
        totalsById.set(key, agg);
      }
    }

    const rows = [...totalsById.entries()]
      .map(([id, v]) => {
        const grossProfit = round2(v.revenue - v.cogs);
        return {
          id, name: v.name, qty: v.qty, revenue: round2(v.revenue), cogs: round2(v.cogs), grossProfit,
          marginPct: v.revenue > 0 ? Math.round((grossProfit / v.revenue) * 10000) / 100 : null,
        };
      })
      .sort((a, b) => b.grossProfit - a.grossProfit);

    return res.status(200).json(buildResponse(from, to, dimension, rows, true));
  }

  // customer / salesperson
  const orders = (await SalesOrder.find({ clientId, status: { $nin: ['Cancelled', 'Pending Approval'] }, createdAt: { $gte: from, $lte: to } }).lean()) as SalesOrderDoc[];
  const field = dimension === 'customer' ? 'customerId' : 'salespersonId';

  const totalsById = new Map<string, { revenue: number; cogs: number }>();
  for (const order of orders) {
    const id = (order as unknown as Record<string, { toString(): string } | undefined>)[field]?.toString();
    if (!id) continue;
    const agg = totalsById.get(id) ?? { revenue: 0, cogs: 0 };
    for (const line of order.items) {
      agg.revenue += line.lineTotal;
      agg.cogs += (line.unitCost ?? 0) * line.quantity;
    }
    totalsById.set(id, agg);
  }

  const ids = [...totalsById.keys()];
  const nameById = new Map<string, string>();
  if (dimension === 'customer') {
    const customers = ids.length ? ((await Customer.find({ _id: { $in: ids }, clientId }).select('name').lean()) as CustomerDoc[]) : [];
    for (const c of customers) nameById.set(c._id.toString(), c.name);
  } else {
    const salespersons = ids.length ? ((await Salesperson.find({ _id: { $in: ids }, clientId }).select('name').lean()) as SalespersonDoc[]) : [];
    for (const s of salespersons) nameById.set(s._id.toString(), s.name);
  }

  const rows = [...totalsById.entries()]
    .map(([id, v]) => {
      const grossProfit = round2(v.revenue - v.cogs);
      return {
        id, name: nameById.get(id) ?? 'Unknown', revenue: round2(v.revenue), cogs: round2(v.cogs), grossProfit,
        marginPct: v.revenue > 0 ? Math.round((grossProfit / v.revenue) * 10000) / 100 : null,
      };
    })
    .sort((a, b) => b.grossProfit - a.grossProfit);

  return res.status(200).json(buildResponse(from, to, dimension, rows, false));
}

function buildResponse(
  from: Date,
  to: Date,
  dimension: Dimension,
  rows: { revenue: number; cogs: number; grossProfit: number }[],
  costIsApproximate: boolean
) {
  const totalRevenue = round2(rows.reduce((sum, r) => sum + r.revenue, 0));
  const totalCogs = round2(rows.reduce((sum, r) => sum + r.cogs, 0));
  const totalGrossProfit = round2(totalRevenue - totalCogs);
  return {
    range: { from, to },
    dimension,
    costIsApproximate,
    summary: {
      totalRevenue,
      totalCogs,
      totalGrossProfit,
      overallMarginPct: totalRevenue > 0 ? Math.round((totalGrossProfit / totalRevenue) * 10000) / 100 : null,
    },
    rows,
  };
}
