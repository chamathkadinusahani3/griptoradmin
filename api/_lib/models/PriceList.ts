import mongoose, { Schema, InferSchemaType } from 'mongoose';

const PriceListOverrideSchema = new Schema(
  {
    partId: { type: Schema.Types.ObjectId, ref: 'Part', required: true },
    price: { type: Number, required: true },
  },
  { _id: false }
);

// Sales Module Phase 6 — a named set of per-part price overrides (e.g.
// "Wholesale", "Dealer Pricing"), assigned to a Customer via
// Customer.defaultPriceListId. Deliberately NOT wired into Quotation,
// CustomerInvoice, or POS checkout (Sale): Quotation/CustomerInvoice lines
// are free-text {description, quantity, unitPrice} with no partId at all
// (garage service/labor lines, not catalog references), and Sale has no
// customer identity whatsoever (POS is anonymous walk-in by design — see
// Customer.ts's own status-field comment). SalesOrder is the only existing
// document that both resolves real Part records per line AND carries a
// customerId, so it's the only genuine integration point for this — see
// api/_lib/priceListResolver.ts and routes/sales-orders/index.ts.
const PriceListSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    name: { type: String, required: true },
    overrides: { type: [PriceListOverrideSchema], default: [] },
  },
  { timestamps: true }
);

export type PriceListDoc = InferSchemaType<typeof PriceListSchema> & { _id: mongoose.Types.ObjectId };

export const PriceList = mongoose.models.PriceList || mongoose.model('PriceList', PriceListSchema);
