// How much of a PurchaseOrder line has actually arrived — shared by the
// receive handler, the serializer, and Returns' supplier-return quantity
// cap, so all three agree on the same number.
//
// PurchaseOrder.items[].receivedQuantity didn't exist before partial
// receiving was added (Phase 5) — a PO that was fully received under the
// old all-or-nothing model has receivedQuantity: 0 on every line despite
// really being complete. Rather than a destructive write migration against
// real tenant data, this backfills that read-side: a 'Received' order with
// an unset/zero receivedQuantity is treated as fully received (= quantity).
export function effectiveReceivedQuantity(line: { quantity: number; receivedQuantity?: number | null }, orderStatus: string): number {
  if (line.receivedQuantity) return line.receivedQuantity;
  if (orderStatus === 'Received') return line.quantity;
  return 0;
}
