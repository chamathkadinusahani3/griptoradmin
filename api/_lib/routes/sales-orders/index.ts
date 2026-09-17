import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../db.js';
import { SalesOrder, SalesOrderDoc } from '../../models/SalesOrder.js';
import { Client, ClientDoc } from '../../models/Client.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Part, PartDoc } from '../../models/Part.js';
import { JobCard, JobCardDoc } from '../../models/JobCard.js';
import { Department } from '../../models/Department.js';
import { Salesperson } from '../../models/Salesperson.js';
import { SalespersonAssignment } from '../../models/SalespersonAssignment.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveBranchFilter } from '../../branch.js';
import { generateSequentialNumber } from '../../numbering.js';
import { computeTotals, getTaxRatePct } from '../../accounting.js';
import { getEffectiveDiscountPct } from '../../creditDiscipline.js';
import { checkCreditExposureLimit } from '../../salesExecCredit.js';
import { checkCustomerCreditLimitGate } from '../../customerCreditLimitGate.js';
import { getReservedQtyByPart } from '../../stockReservation.js';
import { getPriceResolverForCustomer } from '../../priceListResolver.js';
import { checkDiscountMagnitudeGate, checkMinSellingPriceGate } from '../../discountGovernance.js';
import { getActivePromotions, resolveBestPromotion } from '../../promotionResolver.js';
import { serializeSalesOrder } from '../../serializers.js';

type DiscountType = 'amount' | 'percent';

interface CreateSalesOrderLineBody {
  description?: string; // partId — ignored when manual is true
  manual?: boolean;
  name?: string; // required when manual is true
  unitCost?: number; // only meaningful when manual is true (catalog lines snapshot Part.cost instead)
  quantity?: number;
  unitPrice?: number;
  discount1Type?: DiscountType;
  discount1Value?: number;
  discount2Type?: DiscountType;
  discount2Value?: number;
}

interface CreateSalesOrderBody {
  customerId?: string;
  branchId?: string;
  salespersonId?: string;
  jobCardId?: string;
  departmentId?: string;
  creditPeriod?: string;
  scheduledDeliveryDate?: string;
  deliveryName?: string;
  deliveryAddress?: string;
  items?: CreateSalesOrderLineBody[];
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

  const jobCardIds = [...new Set(orders.map((o) => o.jobCardId?.toString()).filter((id): id is string => !!id))];
  const jobCards = jobCardIds.length > 0 ? ((await JobCard.find({ _id: { $in: jobCardIds } }).select('vehicle').lean()) as { _id: unknown; vehicle: string }[]) : [];
  const jobCardLabelById = new Map(jobCards.map((j) => [(j._id as { toString(): string }).toString(), j.vehicle]));

  const departmentIds = [...new Set(orders.map((o) => o.departmentId?.toString()).filter((id): id is string => !!id))];
  const departments = departmentIds.length > 0 ? ((await Department.find({ _id: { $in: departmentIds } }).select('name').lean()) as { _id: unknown; name: string }[]) : [];
  const departmentNameById = new Map(departments.map((d) => [(d._id as { toString(): string }).toString(), d.name]));

  return res.status(200).json({
    salesOrders: orders.map((o) =>
      serializeSalesOrder(
        o,
        nameById.get(o.customerId.toString()),
        o.jobCardId ? jobCardLabelById.get(o.jobCardId.toString()) : undefined,
        o.departmentId ? departmentNameById.get(o.departmentId.toString()) : undefined
      )
    ),
  });
}

function calcLineTotal(gross: number, discount1Type: DiscountType, discount1Value: number, discount2Type: DiscountType, discount2Value: number) {
  const d1 = discount1Type === 'percent' ? (gross * (Number(discount1Value) || 0)) / 100 : Number(discount1Value) || 0;
  const d2 = discount2Type === 'percent' ? (gross * (Number(discount2Value) || 0)) / 100 : Number(discount2Value) || 0;
  return Math.max(0, Math.round((gross - d1 - d2) * 100) / 100);
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sales:manage');
  if (!session) return;

  const {
    customerId,
    branchId: requestedBranchId,
    salespersonId,
    jobCardId,
    departmentId,
    creditPeriod,
    scheduledDeliveryDate,
    deliveryName,
    deliveryAddress,
    items,
    notes,
  } = (req.body ?? {}) as CreateSalesOrderBody;
  if (!customerId || !items || items.length === 0) {
    return res.status(400).json({ error: 'customerId and at least one item are required' });
  }

  await connectToDatabase();

  const customer = (await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean()) as CustomerDoc | null;
  if (!customer) return res.status(400).json({ error: 'Unknown customer' });
  if (customer.status === 'Blocked') return res.status(400).json({ error: 'This customer is blocked and cannot be ordered for' });

  if (salespersonId) {
    const salesperson = await Salesperson.findOne({ _id: salespersonId, clientId: session.clientId }).lean();
    if (!salesperson) return res.status(400).json({ error: 'Unknown salesperson' });
  }
  let jobCardLabel: string | undefined;
  if (jobCardId) {
    const jobCard = (await JobCard.findOne({ _id: jobCardId, clientId: session.clientId }).lean()) as JobCardDoc | null;
    if (!jobCard) return res.status(400).json({ error: 'Unknown job card' });
    jobCardLabel = jobCard.vehicle;
  }
  let departmentName: string | undefined;
  if (departmentId) {
    const department = (await Department.findOne({ _id: departmentId, clientId: session.clientId }).lean()) as { name: string } | null;
    if (!department) return res.status(400).json({ error: 'Unknown department' });
    departmentName = department.name;
  }

  const branchId = resolveBranchFilter(session, requestedBranchId);
  // `items` here identifies each catalog line by partId (via LineItemInput's
  // `description` field, repurposed as a part reference the same way this
  // interface's `quantity`/`unitPrice` are reused verbatim) — resolved
  // against real Part documents before anything else, same "verify against
  // the actual catalog" discipline as purchase-orders/index.ts's own line
  // resolution. A manual: true line skips this entirely — it was never
  // meant to exist in the catalog (a one-off item, service charge, etc).
  const partIds = items.filter((i) => !i.manual).map((i) => i.description).filter((v): v is string => !!v);
  const partFilter: Record<string, unknown> = { _id: { $in: partIds }, clientId: session.clientId };
  if (branchId) partFilter.branchId = branchId;
  const parts = (await Part.find(partFilter).lean()) as PartDoc[];
  const partById = new Map(parts.map((p) => [p._id.toString(), p]));

  // Stock Reservation (Sales Module Phase 4) — "available" is stock minus
  // whatever's already outstanding on other Confirmed/Partially Fulfilled
  // orders (see stockReservation.ts for why this is derived live rather
  // than a stored counter). Tracked as a running tally while looping below
  // so two lines in THIS SAME request referencing the same part don't each
  // independently pass a check that both together would actually oversell.
  const provisionalReserved = await getReservedQtyByPart(session.clientId, parts.map((p) => p._id.toString()));

  // Price Lists (Sales Module Phase 6) — resolves this customer's assigned
  // price list (if any) once for the whole request; falls through to
  // part.price unchanged when priceListsEnabled is off or nothing's
  // assigned, so an order with no price list configured computes
  // byte-identical totals to before this phase existed.
  const priceResolver = await getPriceResolverForCustomer(session.clientId, customerId);

  // Sales Promotions (Sales Module Phase 8) — fetched once for the whole
  // request, same shape as the price resolver above. Applied in a second
  // pass below (after every line's raw quantity*unitPrice is known, since a
  // promotion's minOrderValue is checked against the WHOLE document's raw
  // subtotal, not just one line).
  const activePromotions = await getActivePromotions(session.clientId);

  const resolvedLines: {
    partId: string;
    name: string;
    isManualEntry: boolean;
    quantity: number;
    unitPrice: number;
    unitCost: number;
    discount1Type: DiscountType;
    discount1Value: number;
    discount2Type: DiscountType;
    discount2Value: number;
    lineTotal: number;
    batchNumber?: string;
    serialNumber?: string;
    expiryDate?: Date;
  }[] = [];
  for (const item of items) {
    const discount1Type: DiscountType = item.discount1Type === 'percent' ? 'percent' : 'amount';
    const discount2Type: DiscountType = item.discount2Type === 'percent' ? 'percent' : 'amount';
    const discount1Value = Number(item.discount1Value) || 0;
    const discount2Value = Number(item.discount2Value) || 0;

    if (item.manual) {
      const name = item.name?.trim();
      if (!name) return res.status(400).json({ error: 'A manually-entered line needs a name' });
      const quantity = Number(item.quantity) || 0;
      if (quantity <= 0) return res.status(400).json({ error: `Invalid quantity for "${name}"` });
      const unitPrice = Number(item.unitPrice) || 0;
      if (unitPrice < 0) return res.status(400).json({ error: `Invalid price for "${name}"` });
      const lineTotal = calcLineTotal(quantity * unitPrice, discount1Type, discount1Value, discount2Type, discount2Value);
      resolvedLines.push({
        partId: new mongoose.Types.ObjectId().toString(),
        name,
        isManualEntry: true,
        quantity,
        unitPrice,
        unitCost: Number(item.unitCost) || 0,
        discount1Type,
        discount1Value,
        discount2Type,
        discount2Value,
        lineTotal,
        // No real Part behind a manually-entered line, so no batch/serial/
        // expiry to snapshot.
      });
      continue;
    }

    const part = partById.get(item.description ?? '');
    if (!part) return res.status(400).json({ error: `Unknown part for this branch: ${item.description}` });
    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) return res.status(400).json({ error: `Invalid quantity for "${part.name}"` });

    const partKey = part._id.toString();
    const alreadyReserved = provisionalReserved.get(partKey) ?? 0;
    const available = part.stock - alreadyReserved;
    if (quantity > available) {
      return res.status(400).json({
        error: `Not enough available stock for "${part.name}" — ${part.stock} in stock, ${alreadyReserved} already reserved for other open orders, ${Math.max(0, available)} available`,
      });
    }
    provisionalReserved.set(partKey, alreadyReserved + quantity);

    const unitPrice = Number(item.unitPrice) || priceResolver.resolve(part._id.toString(), part.price);
    const lineTotal = calcLineTotal(quantity * unitPrice, discount1Type, discount1Value, discount2Type, discount2Value);
    resolvedLines.push({
      partId: part._id.toString(),
      name: part.name,
      isManualEntry: false,
      quantity,
      unitPrice,
      unitCost: part.cost ?? 0,
      discount1Type,
      discount1Value,
      discount2Type,
      discount2Value,
      lineTotal,
      // Sales Module Phase 15 — snapshotted so the order keeps a permanent
      // record of which batch/serial was actually ordered, unaffected by
      // any later edit to the Part.
      batchNumber: part.batchNumber ?? undefined,
      serialNumber: part.serialNumber ?? undefined,
      expiryDate: part.expiryDate ?? undefined,
    });
  }

  // Sales Promotions (Sales Module Phase 8) — a line with NO manually-entered
  // discount (discount1Value and discount2Value both 0 — the same "0 means
  // unset" convention used everywhere else in this file) is checked against
  // every active promotion; the best-matching one (largest resulting
  // discount) is applied automatically. A line the staff already discounted
  // by hand is left completely alone — manual entry always wins, same
  // precedent as Price Lists' unitPrice and Stock Reservation. Manual
  // (non-catalog) lines have no partId to match against and are skipped.
  const promoAppliedIndexes = new Set<number>();
  const appliedPromotions: { lineName: string; promotionName: string }[] = [];
  if (activePromotions.length > 0) {
    const orderSubtotal = resolvedLines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
    resolvedLines.forEach((line, i) => {
      if (line.isManualEntry || line.discount1Value !== 0 || line.discount2Value !== 0) return;
      const grossLineTotal = line.quantity * line.unitPrice;
      const match = resolveBestPromotion(
        activePromotions,
        { customerType: customer.type, branchId: branchId || undefined, orderSubtotal },
        line.partId,
        line.quantity,
        grossLineTotal
      );
      if (!match) return;
      line.discount1Type = match.discountType;
      line.discount1Value = match.discountValue;
      line.lineTotal = calcLineTotal(grossLineTotal, match.discountType, match.discountValue, line.discount2Type, line.discount2Value);
      promoAppliedIndexes.add(i);
      appliedPromotions.push({ lineName: line.name, promotionName: match.promotionName });
    });
  }

  // Discount Governance (Sales Module Phase 7) — moved ahead of the existing
  // client fetch below so both new gates and the pre-existing
  // requireSalesOrderApproval/customerCreditLimitPolicy reads share one
  // query instead of two.
  const client = (await Client.findById(session.clientId).select('requireSalesOrderApproval customerCreditLimitPolicy maxDiscountPctBeforeApproval').lean()) as ClientDoc | null;

  // A promotion the tenant itself configured is pre-approved — excluded here
  // so it never spuriously triggers a Discount Authorization request the
  // way an oversized MANUAL discount would (Sales Module Phase 8's explicit
  // carve-out from Phase 7's gate). Still fully subject to the min-selling-
  // price floor below — that's a margin protection, not a staff-overreach
  // concern, and applies regardless of where the discount came from.
  const discountGate = await checkDiscountMagnitudeGate(
    session,
    client?.maxDiscountPctBeforeApproval ?? 0,
    resolvedLines
      .map((l, i) => ({ name: l.name, gross: l.quantity * l.unitPrice, lineTotal: l.lineTotal, i }))
      .filter((l) => !promoAppliedIndexes.has(l.i))
  );
  if (discountGate.blocked) return res.status(400).json({ error: discountGate.message });

  const minPriceGate = await checkMinSellingPriceGate(
    session,
    resolvedLines
      .filter((l) => !l.isManualEntry)
      .map((l) => ({
        name: l.name,
        effectiveUnitPrice: l.quantity > 0 ? l.lineTotal / l.quantity : l.unitPrice,
        minSellingPrice: partById.get(l.partId)?.minSellingPrice ?? 0,
      }))
  );
  if (minPriceGate.blocked) return res.status(400).json({ error: minPriceGate.message });

  const effectiveDiscountPct = await getEffectiveDiscountPct(customer, session.clientId);
  const taxRatePct = await getTaxRatePct(session.clientId);
  // computeTotals only understands quantity*unitPrice — feed it an
  // "effective" unitPrice equal to this line's post-line-discount total per
  // unit, so the existing shared subtotal/order-discount/tax math (used
  // identically by Quotation/CustomerInvoice) operates on the
  // already-line-discounted amount. When no line discount is set this
  // collapses to the original unitPrice, so an order with no Dis1/Dis2 use
  // computes byte-identical totals to before these fields existed. The real
  // per-line unitPrice/unitCost/discount fields are stored separately below
  // from resolvedLines, not from this call's echo.
  const { subtotal, discountPct, discountAmount, taxAmount, total } = computeTotals(
    resolvedLines.map((l) => ({
      description: l.name,
      quantity: l.quantity,
      unitPrice: l.quantity > 0 ? Math.round((l.lineTotal / l.quantity) * 100) / 100 : l.unitPrice,
    })),
    effectiveDiscountPct,
    taxRatePct
  );

  const limitCheck = await checkCreditExposureLimit(session, customer, total);
  if (limitCheck.blocked) return res.status(400).json({ error: limitCheck.message });

  const creditLimitGate = await checkCustomerCreditLimitGate(session, client?.customerCreditLimitPolicy ?? 'Off', customer, total);
  if (creditLimitGate.blocked) return res.status(400).json({ error: creditLimitGate.message });

  const salesOrderNumber = await generateSequentialNumber(SalesOrder, session.clientId, 'salesOrderNumber', 'salesOrder');

  // Best-effort attribution — an explicit salespersonId always wins; a
  // customer with no active assignment and no explicit pick simply gets no
  // salesperson credited, never blocks order creation.
  let resolvedSalespersonId = salespersonId;
  if (!resolvedSalespersonId) {
    const assignment = await SalespersonAssignment.findOne({ clientId: session.clientId, customerId, active: true }).lean();
    resolvedSalespersonId = assignment?.salespersonId?.toString();
  }

  const order = await SalesOrder.create({
    clientId: session.clientId,
    salesOrderNumber,
    customerId,
    branchId: branchId || undefined,
    salespersonId: resolvedSalespersonId || undefined,
    jobCardId: jobCardId || undefined,
    departmentId: departmentId || undefined,
    creditPeriod: creditPeriod || undefined,
    scheduledDeliveryDate: scheduledDeliveryDate ? new Date(scheduledDeliveryDate) : undefined,
    deliveryName: deliveryName || undefined,
    deliveryAddress: deliveryAddress || undefined,
    items: resolvedLines,
    subtotal,
    discountPct,
    discountAmount,
    taxAmount,
    total,
    notes,
    status: client?.requireSalesOrderApproval ? 'Pending Approval' : 'Confirmed',
  });

  const discountWarning = [discountGate.warning, minPriceGate.warning].filter((w): w is string => !!w).join(' ') || undefined;

  return res.status(201).json({
    salesOrder: serializeSalesOrder(order.toObject(), customer.name, jobCardLabel, departmentName),
    creditWarning: creditLimitGate.warning,
    discountWarning,
    appliedPromotions: appliedPromotions.length > 0 ? appliedPromotions : undefined,
  });
}
