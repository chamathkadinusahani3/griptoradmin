import mongoose, { Schema, InferSchemaType } from 'mongoose';
import { AttachmentSchema } from './attachmentSchema.js';

// Scoped to parts/counter orders only (per the module-independence roadmap's
// resolved decision) — a staged "confirmed but not yet fulfilled" order
// sitting ALONGSIDE the existing instant POS Sale (checkout.ts) and the
// existing service-side Quotation -> JobCard/Invoice path, neither of
// which this touches. Same customer-facing tax/discount treatment as
// Quotation.ts, since this is a real commitment to a customer, not an
// internal cost record like PurchaseOrder.
const SalesOrderLineSchema = new Schema(
  {
    // For a manually-entered line (isManualEntry: true, no catalog match)
    // this is a server-generated id that never resolves to a real Part
    // document — kept required so this line still has the same stable
    // per-line key every fulfillment/delivery-tracking Map in fulfill.ts,
    // delivery-notes/[id]/confirm.ts, and pendingDeliveries.ts already keys
    // off of, without those needing any partId-optional branching.
    partId: { type: Schema.Types.ObjectId, ref: 'Part', required: true },
    name: { type: String, required: true },
    // True for a line typed directly on the order (name/price entered by
    // hand — a one-off item, service charge, or anything not in the Part
    // catalog) rather than picked from it. The only thing this actually
    // changes downstream: fulfill.ts/delivery-notes confirm.ts skip the
    // Part stock decrement for these lines (there's no real stock to move).
    isManualEntry: { type: Boolean, default: false },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    // Snapshotted from Part.cost at add-time — purely informational (margin
    // visibility), never affects subtotal/discount/tax math below.
    unitCost: { type: Number, default: 0 },
    // Two independent, non-compounding per-line discounts (each either a
    // flat amount or a percent of this line's own quantity*unitPrice) — the
    // real "Dis1/Dis2" columns from the reference layout. Both default to a
    // zero 'amount' discount, so an order that never touches them computes
    // byte-identical totals to before these fields existed.
    discount1Type: { type: String, enum: ['amount', 'percent'], default: 'amount' },
    discount1Value: { type: Number, default: 0 },
    discount2Type: { type: String, enum: ['amount', 'percent'], default: 'amount' },
    discount2Value: { type: Number, default: 0 },
    // Always server-computed: quantity*unitPrice minus both line discounts,
    // floored at 0. This is what actually feeds the order's subtotal (see
    // routes/sales-orders/index.ts) — not quantity*unitPrice directly.
    lineTotal: { type: Number, required: true },
    // How much of this line has actually been handed over so far — same
    // partial-fulfillment shape as PurchaseOrder.items[].receivedQuantity.
    deliveredQuantity: { type: Number, default: 0 },
    // Sales Module Phase 15 — snapshotted from Part.batchNumber/
    // serialNumber/expiryDate at order-creation time for a catalog line
    // (see Part.ts's own comment); never set for a manually-entered line,
    // which has no real Part behind it.
    batchNumber: { type: String },
    serialNumber: { type: String },
    expiryDate: { type: Date },
  },
  { _id: false }
);

const SalesOrderSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    salesOrderNumber: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    // Optional — defaulted from the customer's active SalespersonAssignment
    // at creation time (Sales Force Management SF-Phase 6). Unset on every
    // order created before this field existed; nothing reads it as required.
    salespersonId: { type: Schema.Types.ObjectId, ref: 'Salesperson' },
    // Optional linkage to an in-progress service job this parts order is
    // for — same "informational reference, no derived-field forcing" role
    // Quotation.jobCardId plays there, minus the vehicle/plate auto-fill
    // (this model has no vehicle concept — it's a parts/counter order).
    jobCardId: { type: Schema.Types.ObjectId, ref: 'JobCard' },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
    // Free-text payment terms (e.g. "Cash on Delivery", "Net 30 Days") —
    // display-only, doesn't drive any credit/balance logic.
    creditPeriod: { type: String },
    // Simple Cash/Credit categorization, distinct from (and coarser than)
    // creditPeriod's detailed terms string above — display/reporting only.
    payType: { type: String, enum: ['Cash', 'Credit'], default: 'Credit' },
    scheduledDeliveryDate: { type: Date },
    // When the delivery was actually marked/flagged for dispatch — a
    // separate milestone from scheduledDeliveryDate (the plan) and the
    // DeliveryNote's own confirm timestamp (the actual handover).
    deliveryMarkingDate: { type: Date },
    // Free-text delivery categorization (e.g. "Normal", "Express") —
    // display-only, doesn't drive any logic.
    deliveryType: { type: String, default: 'Normal' },
    // Ship-to name/address, distinct from the Customer's own — unset means
    // "deliver to the customer's own address/contact" (no separate default
    // stored here; the UI/print flow falls back to the customer record).
    deliveryName: { type: String },
    deliveryAddress: { type: String },
    // Snapshotted from the Customer at creation time (defaults to
    // customer.billingAddress/phone/taxNumber, editable/overridable per
    // order) so a later change to the customer record never alters an
    // already-issued order's own printed details — same snapshot discipline
    // as Quotation/CustomerInvoice's vehicle/plate fields.
    customerAddress: { type: String },
    customerTel: { type: String },
    // GRIPTOR ERP customization — 'Non Vat' (the default) forces taxAmount
    // to 0 for this order regardless of the tenant's configured taxRatePct;
    // 'Vat' applies it normally. See salesOrderResolve.ts for where this is
    // enforced.
    vatType: { type: String, enum: ['Vat', 'Non Vat'], default: 'Non Vat' },
    vatNumber: { type: String },
    svatNumber: { type: String },
    // Free-text product-brand association for this order (e.g. a tyre
    // brand) — display/reporting only, order-level rather than per-line
    // since the reference form places it in the document header.
    brand: { type: String },
    items: { type: [SalesOrderLineSchema], default: [] },
    // Always server-computed from `items` — same computeTotals discipline
    // as Quotation/CustomerInvoice (api/_lib/accounting.ts).
    subtotal: { type: Number, required: true },
    discountPct: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, required: true },
    total: { type: Number, required: true },
    // 'Pending Approval' only ever appears when the tenant has opted into
    // Client.requireSalesOrderApproval (ERP-Phase 2) — the create route
    // still defaults straight to 'Confirmed' otherwise, so an unconfigured
    // tenant sees byte-identical behavior to before this field existed.
    status: { type: String, enum: ['Pending Approval', 'Confirmed', 'Partially Fulfilled', 'Fulfilled', 'Cancelled'], default: 'Confirmed' },
    // `notes` is the customer-facing "Remark"; `staffNote` below is a
    // separate internal-only field — kept distinct rather than reusing one
    // field for both, since the reference form shows them as two inputs.
    notes: { type: String },
    staffNote: { type: String },
    // Set only when this order actually went through the approval gate —
    // standardized field names shared with every future gated document via
    // api/_lib/approvalGate.ts.
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectionReason: { type: String },
    // Sales Module Phase 16 — see attachmentSchema.ts's own comment.
    attachments: { type: [AttachmentSchema], default: [] },
  },
  { timestamps: true }
);

export type SalesOrderDoc = InferSchemaType<typeof SalesOrderSchema> & { _id: mongoose.Types.ObjectId };

export const SalesOrder = mongoose.models.SalesOrder || mongoose.model('SalesOrder', SalesOrderSchema);
