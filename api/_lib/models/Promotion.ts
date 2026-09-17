import mongoose, { Schema, InferSchemaType } from 'mongoose';

// Sales Module Phase 8 — a tenant-configured discount that auto-applies at
// line-adding time on Sales Order and POS checkout (the only two documents
// with real Part references — Quotation/CustomerInvoice lines are free-text
// {description, quantity, unitPrice} with no partId, same structural
// exclusion already established in Phase 6's Price Lists). POS checkout has
// no customerId at all, so a promotion scoped to specific customerTypes
// simply never matches a POS line; a promotion with no customerTypes
// restriction (the common case) applies everywhere.
//
// Single-condition-set only for this first cut: one promotion, one
// discount, no stacking/compounding with another promotion or with a
// manually-entered discount (an explicit staff discount on a Sales Order
// line always wins and skips promotion lookup entirely for that line — same
// "manual always wins" precedent as Phase 6's Price Lists and Phase 7's
// Discount Governance). When multiple promotions could apply to the same
// line, the one giving the largest discount wins (promotionResolver.ts).
const PromotionSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    name: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    discountType: { type: String, enum: ['percent', 'amount'], required: true },
    discountValue: { type: Number, required: true },
    // Empty array on any of these three = "applies to all" — same
    // "empty/0 means unrestricted" convention as Part.minSellingPrice/
    // Customer.creditLimit.
    partIds: { type: [Schema.Types.ObjectId], ref: 'Part', default: [] },
    customerTypes: { type: [String], enum: ['individual', 'corporate', 'retail', 'wholesale', 'dealer'], default: [] },
    branchIds: { type: [Schema.Types.ObjectId], ref: 'Branch', default: [] },
    minQty: { type: Number, default: 0 },
    // Checked against the whole document's raw (pre-discount) subtotal, not
    // just this one line — so a promotion can require "spend at least X
    // overall" rather than "buy at least X of this one part."
    minOrderValue: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type PromotionDoc = InferSchemaType<typeof PromotionSchema> & { _id: mongoose.Types.ObjectId };

export const Promotion = mongoose.models.Promotion || mongoose.model('Promotion', PromotionSchema);
