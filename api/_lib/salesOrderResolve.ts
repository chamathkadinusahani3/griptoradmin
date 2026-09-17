import mongoose from 'mongoose';
import { TenantSession } from './auth.js';
import { Client, ClientDoc } from './models/Client.js';
import { CustomerDoc } from './models/Customer.js';
import { Part, PartDoc } from './models/Part.js';
import { resolveBranchFilter } from './branch.js';
import { computeTotals, getTaxRatePct } from './accounting.js';
import { getEffectiveDiscountPct } from './creditDiscipline.js';
import { checkCreditExposureLimit } from './salesExecCredit.js';
import { checkCustomerCreditLimitGate } from './customerCreditLimitGate.js';
import { getReservedQtyByPart } from './stockReservation.js';
import { getPriceResolverForCustomer } from './priceListResolver.js';
import { checkDiscountMagnitudeGate, checkMinSellingPriceGate } from './discountGovernance.js';
import { getActivePromotions, resolveBestPromotion } from './promotionResolver.js';

export type DiscountType = 'amount' | 'percent';

export interface SalesOrderLineBody {
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

export interface ResolvedSalesOrderLine {
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
}

function calcLineTotal(gross: number, discount1Type: DiscountType, discount1Value: number, discount2Type: DiscountType, discount2Value: number) {
  const d1 = discount1Type === 'percent' ? (gross * (Number(discount1Value) || 0)) / 100 : Number(discount1Value) || 0;
  const d2 = discount2Type === 'percent' ? (gross * (Number(discount2Value) || 0)) / 100 : Number(discount2Value) || 0;
  return Math.max(0, Math.round((gross - d1 - d2) * 100) / 100);
}

interface ResolveParams {
  session: TenantSession;
  customer: CustomerDoc;
  requestedBranchId?: string;
  items: SalesOrderLineBody[];
  /** GRIPTOR ERP customization — see SalesOrder.ts's vatType comment. 'Non Vat' zeroes taxAmount regardless of the tenant's taxRatePct. */
  vatType: 'Vat' | 'Non Vat';
  /** Set only when re-resolving an existing order's lines during an edit — see stockReservation.ts's getReservedQtyByPart for why. */
  excludeOrderId?: string;
}

export type ResolveResult =
  | {
      ok: true;
      branchId?: string;
      resolvedLines: ResolvedSalesOrderLine[];
      subtotal: number;
      discountPct: number;
      discountAmount: number;
      taxAmount: number;
      total: number;
      client: ClientDoc | null;
      creditWarning?: string;
      discountWarning?: string;
      appliedPromotions: { lineName: string; promotionName: string }[];
    }
  | { ok: false; status: number; error: string };

/**
 * The full "turn raw line-item input into priced, discounted, promotion-
 * applied, governance-checked SalesOrder lines + document totals" pipeline —
 * extracted from routes/sales-orders/index.ts's handleCreate so the new
 * edit action (routes/sales-orders/[id].ts) can reuse the EXACT same price
 * list / promotion / stock reservation / discount governance / credit limit
 * logic rather than re-deriving (and risking drift from) a second copy.
 * Every comment explaining WHY a given check exists still lives at its
 * original call site inside this function.
 */
export async function resolveSalesOrderLines(params: ResolveParams): Promise<ResolveResult> {
  const { session, customer, requestedBranchId, items, vatType, excludeOrderId } = params;
  const customerId = customer._id.toString();

  if (!items || items.length === 0) return { ok: false, status: 400, error: 'At least one item is required' };

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
  const provisionalReserved = await getReservedQtyByPart(session.clientId, parts.map((p) => p._id.toString()), excludeOrderId);

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

  const resolvedLines: ResolvedSalesOrderLine[] = [];
  for (const item of items) {
    const discount1Type: DiscountType = item.discount1Type === 'percent' ? 'percent' : 'amount';
    const discount2Type: DiscountType = item.discount2Type === 'percent' ? 'percent' : 'amount';
    const discount1Value = Number(item.discount1Value) || 0;
    const discount2Value = Number(item.discount2Value) || 0;

    if (item.manual) {
      const name = item.name?.trim();
      if (!name) return { ok: false, status: 400, error: 'A manually-entered line needs a name' };
      const quantity = Number(item.quantity) || 0;
      if (quantity <= 0) return { ok: false, status: 400, error: `Invalid quantity for "${name}"` };
      const unitPrice = Number(item.unitPrice) || 0;
      if (unitPrice < 0) return { ok: false, status: 400, error: `Invalid price for "${name}"` };
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
    if (!part) return { ok: false, status: 400, error: `Unknown part for this branch: ${item.description}` };
    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) return { ok: false, status: 400, error: `Invalid quantity for "${part.name}"` };

    const partKey = part._id.toString();
    const alreadyReserved = provisionalReserved.get(partKey) ?? 0;
    const available = part.stock - alreadyReserved;
    if (quantity > available) {
      return {
        ok: false,
        status: 400,
        error: `Not enough available stock for "${part.name}" — ${part.stock} in stock, ${alreadyReserved} already reserved for other open orders, ${Math.max(0, available)} available`,
      };
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
  const client = (await Client.findById(session.clientId).select(
    'requireSalesOrderApproval customerCreditLimitPolicy maxDiscountPctBeforeApproval'
  ).lean()) as ClientDoc | null;

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
  if (discountGate.blocked) return { ok: false, status: 400, error: discountGate.message! };

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
  if (minPriceGate.blocked) return { ok: false, status: 400, error: minPriceGate.message! };

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
  const totals = computeTotals(
    resolvedLines.map((l) => ({
      description: l.name,
      quantity: l.quantity,
      unitPrice: l.quantity > 0 ? Math.round((l.lineTotal / l.quantity) * 100) / 100 : l.unitPrice,
    })),
    effectiveDiscountPct,
    taxRatePct
  );

  // GRIPTOR ERP customization (VAT Type field) — 'Non Vat' means this
  // specific order is exempt: tax is forced to 0 regardless of the tenant's
  // configured taxRatePct, and total is recomputed to match. 'Vat' (the
  // default) leaves computeTotals' normal tax-inclusive total untouched.
  const subtotal = totals.subtotal;
  const discountPct = totals.discountPct;
  const discountAmount = totals.discountAmount;
  const taxAmount = vatType === 'Non Vat' ? 0 : totals.taxAmount;
  const total = vatType === 'Non Vat' ? Math.round((subtotal - discountAmount) * 100) / 100 : totals.total;

  const limitCheck = await checkCreditExposureLimit(session, customer, total);
  if (limitCheck.blocked) return { ok: false, status: 400, error: limitCheck.message! };

  const creditLimitGate = await checkCustomerCreditLimitGate(session, client?.customerCreditLimitPolicy ?? 'Off', customer, total);
  if (creditLimitGate.blocked) return { ok: false, status: 400, error: creditLimitGate.message! };

  const discountWarning = [discountGate.warning, minPriceGate.warning].filter((w): w is string => !!w).join(' ') || undefined;

  return {
    ok: true,
    branchId: branchId || undefined,
    resolvedLines,
    subtotal,
    discountPct,
    discountAmount,
    taxAmount,
    total,
    client,
    creditWarning: creditLimitGate.warning,
    discountWarning,
    appliedPromotions,
  };
}
