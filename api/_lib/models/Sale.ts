import mongoose, { Schema, InferSchemaType } from 'mongoose';

const SaleLineSchema = new Schema(
  {
    partId: { type: Schema.Types.ObjectId, ref: 'Part', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    qty: { type: Number, required: true },
  },
  { _id: false }
);

const SaleSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    items: { type: [SaleLineSchema], required: true },
    subtotal: { type: Number, required: true },
    tax: { type: Number, required: true },
    total: { type: Number, required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    // Defaults to Cash — the walk-in-counter norm this model was built
    // around (see api/_lib/routes/sales/index.ts's original comment: no
    // payment-method distinction existed before Cash Management needed
    // one to reconcile a till session against).
    paymentMethod: { type: String, enum: ['Cash', 'Card', 'Bank Transfer', 'Other'], default: 'Cash' },
    // Foundation for Phase 8's GL auto-posting — see Expense.ts's identical field.
    accountId: { type: Schema.Types.ObjectId, ref: 'ChartOfAccounts' },
  },
  { timestamps: true }
);

export type SaleDoc = InferSchemaType<typeof SaleSchema> & { _id: mongoose.Types.ObjectId };

export const Sale = mongoose.models.Sale || mongoose.model('Sale', SaleSchema);
