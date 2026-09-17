import { SalesOrder } from './models/SalesOrder.js';

// Sales Module Phase 4 — "reserved" stock is deliberately NOT a stored
// counter on Part (no Part.reservedQty field). It's derived live, on read,
// by summing (quantity - deliveredQuantity) across every Confirmed/
// Partially Fulfilled SalesOrder line for a part — the same "derive, don't
// store, so it can't drift" discipline this codebase already uses for
// SalesTarget's actual-vs-target, Customer Statement, and AR/AP Aging.
//
// This is a deliberate departure from a naive "increment on order, decrement
// on fulfill/cancel" counter: that shape would need careful, error-prone
// bookkeeping across 4+ call sites (create, approve, reject, cancel,
// fulfill, DAG confirm) AND would start every SalesOrder created before this
// phase existed at 0 reserved — meaning fulfilling an old order would
// under-flow a naive `$inc: {reservedQty: -qty}` into negative territory,
// permanently and incorrectly inflating "available" for that part forever
// after. Deriving live sidesteps all of that: a Cancelled/Rejected order
// (status flips away from Confirmed/Partially Fulfilled) and a fulfilled
// line (deliveredQuantity increases) both fall out of this sum automatically
// on the very next read, with zero extra release code needed anywhere
// (fulfill.ts and delivery-notes/[id]/confirm.ts need no changes at all —
// they already do exactly the deliveredQuantity increments this depends on).
// Only Pending Approval orders are excluded — a not-yet-approved order isn't
// a real commitment yet, so it shouldn't lock inventory away from anyone
// else (matches Client.requireSalesOrderApproval's own framing).
const RESERVING_STATUSES = ['Confirmed', 'Partially Fulfilled'];

interface ReservationLine {
  partId: { toString(): string };
  quantity: number;
  deliveredQuantity?: number;
  isManualEntry?: boolean;
}

/**
 * Reserved quantity per partId, summed across every open SalesOrder —
 * optionally narrowed to a specific set of parts, and optionally excluding
 * one specific order's own lines from the sum. That exclusion is for
 * editing an existing Confirmed/Partially Fulfilled order (routes/
 * sales-orders/[id].ts's edit action): the order's own current reservation
 * must not count against itself when re-validating its (possibly changed)
 * quantities, or a same-or-smaller edit could be incorrectly rejected as
 * exceeding "available" stock.
 */
export async function getReservedQtyByPart(clientId: string, partIds?: string[], excludeOrderId?: string): Promise<Map<string, number>> {
  const filter: Record<string, unknown> = { clientId, status: { $in: RESERVING_STATUSES } };
  if (partIds && partIds.length > 0) filter['items.partId'] = { $in: partIds };
  if (excludeOrderId) filter._id = { $ne: excludeOrderId };

  const orders = (await SalesOrder.find(filter).select('items').lean()) as unknown as { items: ReservationLine[] }[];
  const reservedByPart = new Map<string, number>();
  for (const order of orders) {
    for (const line of order.items) {
      if (line.isManualEntry) continue; // no real Part behind a manual line
      const outstanding = line.quantity - (line.deliveredQuantity ?? 0);
      if (outstanding <= 0) continue;
      const key = line.partId.toString();
      reservedByPart.set(key, (reservedByPart.get(key) ?? 0) + outstanding);
    }
  }
  return reservedByPart;
}

export async function getReservedQtyForPart(clientId: string, partId: string): Promise<number> {
  const map = await getReservedQtyByPart(clientId, [partId]);
  return map.get(partId) ?? 0;
}
