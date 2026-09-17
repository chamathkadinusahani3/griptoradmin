import mongoose, { Schema, InferSchemaType } from 'mongoose';
import { AttachmentSchema } from './attachmentSchema.js';

// Sales Module Phase 11 — replaces the previous free-text reason with a
// closed set (still paired with the existing free-text `notes` field for
// elaboration — 'Other' is expected to lean on notes). Shared by both
// directions rather than split into customer/supplier variants since most
// of these apply equally to either ("Defective/Faulty" fits a customer
// returning a bad part just as well as a supplier having shipped one).
export const RETURN_REASONS = [
  'Defective/Faulty',
  'Wrong Item',
  'Damaged in Transit',
  'Customer Changed Mind',
  'Excess/Overstock',
  'Quality Issue',
  'Duplicate Order',
  'Other',
] as const;

// Sales Module Phase 11 — opt-in gate (Client.requireReturnApproval) before
// a return's stock/CreditNote-DebitNote/refund-GL side effects actually
// execute. 'Approved' is the default so a tenant that hasn't opted in (or
// any Return created before this field existed) reads as already-executed,
// matching this model's original always-immediate behavior exactly.
// Pending/Inspected are pass-through waypoints with zero side effects of
// their own — Inspected is optional (Approve is reachable directly from
// Pending); Rejected is terminal, also with zero side effects, since
// nothing was ever moved to begin with. Confined strictly to this existing
// Return model/sourceType — does NOT extend to SalesOrder/CustomerInvoice
// returns, an explicit scope boundary from the roadmap.
export const RETURN_STATUSES = ['Pending', 'Inspected', 'Approved', 'Rejected'] as const;

// Sales Module Phase 12 — turns the refund fields below from a single
// snapshot (set once, GL-posted immediately) into a real lifecycle, gated
// behind its own independent opt-in (Client.requireRefundApproval, default
// false) — separate from Phase 11's requireReturnApproval, since a tenant
// may want goods-movement approval without refund approval or vice versa.
// Only ever set when refundAmount is actually present; undefined means "no
// refund on this return" the same as before this phase existed.
//
// 'Requested' is reached the moment this Return's own goods-effects execute
// (immediately at creation, or at Approve time under Phase 11's gate) — at
// that point a 'Refund Request' Approval doc (Approval.ts's own
// already-existing, previously-unused type) is filed for visibility on the
// Approvals page, but the actual state lives here, not on that flat log
// (same reasoning Phase 2's customerCreditLimitGate.ts established: the log
// entry is for audit visibility, the real authority check happens at the
// action's own permission gate). 'Approved' requires approvals:respond
// (routes/returns/[id].ts's approve-refund action) — a hard permission
// gate, same "confirm step" shape as DebitNote.ts rather than a
// block-with-bypass check, since this action IS the approval. 'Paid' is
// where the refund GL entry actually posts (mark-refund-paid), reusable by
// returns:manage since disbursing an already-approved refund is routine
// cashier work, not a second approval.
export const RETURN_REFUND_STATUSES = ['Requested', 'Approved', 'Paid'] as const;

// Snapshotted at return time, same convention as Sale.items/PurchaseOrder.items
// — the return still reads correctly even if the Part is later renamed/deleted.
// partId is optional as of the 'customer-invoice' sourceType below —
// CustomerInvoice line items are free-text (description/quantity/unitPrice,
// see CustomerInvoice.ts's LineItemSchema) with no Part reference at all, so
// a return against one has nothing to reverse Part.stock against for that
// line. `name` doubles as that free-text description in that case.
const ReturnLineSchema = new Schema(
  {
    partId: { type: Schema.Types.ObjectId, ref: 'Part' },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
  },
  { _id: false }
);

// A single append-only record for three source shapes: a customer returning
// something bought via a POS Sale, a customer returning something billed on
// a CustomerInvoice (Dealer Credit Control roadmap Module 1 — added so a
// B2B dealer's returns, which happen through SalesOrder/CustomerInvoice
// rather than a walk-in Sale, can be attributed to them at all for a return
// ratio), or the garage returning something to a supplier (a Received
// PurchaseOrder). Deliberately does NOT touch PurchaseOrder.balance/
// paidAmount for the supplier direction — that math is already real and
// tested (see purchaseOrderPayments.ts); a return is independent
// record-keeping, not a payment. The customer-invoice direction is the one
// exception: see routes/returns/index.ts's executeReturnEffects, which
// auto-applies the CreditNote this always creates straight back against the
// SAME invoice's balance (reusing utilizations/index.ts's applySource/
// applyTarget) — a Sale-sourced return still stays pure record-keeping. Part
// stock is reversed automatically only for lines that carry a partId (see
// routes/returns/index.ts's transaction).
const ReturnSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    direction: { type: String, enum: ['customer', 'supplier'], required: true },
    sourceType: { type: String, enum: ['sale', 'purchase-order', 'customer-invoice'], required: true },
    sourceId: { type: Schema.Types.ObjectId, required: true },
    returnNumber: { type: String, required: true },
    items: { type: [ReturnLineSchema], default: [] },
    // Always server-computed from `items`.
    totalAmount: { type: Number, required: true },
    reason: { type: String, enum: RETURN_REASONS, required: true },
    notes: { type: String },
    status: { type: String, enum: RETURN_STATUSES, default: 'Approved' },
    inspectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    inspectedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: { type: Date },
    rejectionReason: { type: String },
    // Only set if money actually changed hands as a result of this return —
    // a refund handed to a customer, or a credit/refund received from a
    // supplier. Same shape as CustomerInvoice/PurchaseOrder's own payment
    // records so it can ride the same Transactions feed and reconciliation
    // flow (api/_lib/routes/tenant/bank-transactions.ts).
    refundAmount: { type: Number },
    refundMethod: { type: String, enum: ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'] },
    chequeNumber: { type: String },
    bankAccountId: { type: Schema.Types.ObjectId, ref: 'BankAccount' },
    refundDate: { type: Date },
    reconciled: { type: Boolean, default: false },
    reconciledAt: { type: Date },
    refundStatus: { type: String, enum: RETURN_REFUND_STATUSES },
    refundApprovedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    refundApprovedAt: { type: Date },
    refundPaidBy: { type: Schema.Types.ObjectId, ref: 'User' },
    refundPaidAt: { type: Date },
    // Sales Module Phase 16 — see attachmentSchema.ts's own comment.
    attachments: { type: [AttachmentSchema], default: [] },
  },
  { timestamps: true }
);

export type ReturnDoc = InferSchemaType<typeof ReturnSchema> & { _id: mongoose.Types.ObjectId };

export const Return = mongoose.models.Return || mongoose.model('Return', ReturnSchema);
