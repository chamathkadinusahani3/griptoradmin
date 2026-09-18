import mongoose, { Schema, InferSchemaType } from 'mongoose';

// Dealer Credit Control roadmap Module 4 — matches the spec's own dropdown
// exactly. 'Other' is expected to lean on the payment record's existing
// free-text `notes` field for elaboration, same convention as Return.ts's
// RETURN_REASONS.
export const SETTLEMENT_DISCOUNT_REASONS = ['Cash Discount', 'Quantity Discount', 'Incentive', 'Old Types', 'Company Offer', 'Other'] as const;

const PurchaseOrderLineSchema = new Schema(
  {
    partId: { type: Schema.Types.ObjectId, ref: 'Part', required: true },
    // Snapshotted at order time, same convention as JobCard.partsUsed — the
    // order still reads correctly even if the Part is later renamed/deleted.
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitCost: { type: Number, required: true },
    // Dealer Credit Control roadmap Module 4 — the price originally agreed/
    // quoted by the supplier, distinct from unitCost (what's actually being
    // ordered at) so a procurement officer can spot a discrepancy between
    // what was promised and what's being paid. Purely a data-capture field —
    // does NOT feed into subtotal/total, which stay computed from unitCost
    // exactly as before this existed.
    promisedPrice: { type: Number, required: true },
    // The manufacturer/brand-specific discount negotiated for this line —
    // required (0 is a valid, explicit "no discount" answer) per the spec's
    // own mandatory-fields list. Also purely informational, same reasoning
    // as promisedPrice above.
    brandDiscountPct: { type: Number, required: true },
    // How much of this line has actually arrived so far — a PO can now be
    // received across more than one delivery (see GoodsReceivedNote.ts).
    // Documents written before this field existed read as 0 here even
    // though an old-model 'Received' PO really was fully received —
    // serializePurchaseOrder() backfills that read-side, see its comment,
    // rather than a destructive write migration against real tenant data.
    receivedQuantity: { type: Number, default: 0 },
  },
  { _id: false }
);

// Same shape as CustomerInvoice's PaymentRecordSchema, plus chequeNumber —
// the garage-pays-supplier direction of the same debit/credit record-keeping,
// so a supplier statement can be computed live the same "derive, don't
// store" way Supplier.openOrders/lastOrder/onTime already are.
const PaymentRecordSchema = new Schema(
  {
    amount: { type: Number, required: true },
    method: { type: String, enum: ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'], required: true },
    date: { type: Date, required: true },
    notes: { type: String },
    // Only meaningful for method: 'Cheque'.
    chequeNumber: { type: String },
    // Which BankAccount this cheque/transfer was drawn from — unset for Cash.
    bankAccountId: { type: Schema.Types.ObjectId, ref: 'BankAccount' },
    // Dealer Credit Control roadmap Module 6 — same as CustomerInvoice's
    // identical field: only meaningful for method 'Card', dynamically
    // calculated from the chosen BankAccount's cardSettlementDays.
    settlementDate: { type: Date },
    // ERP-Phase 6 "Settlement Discount" — a discount the supplier offered
    // for settling this specific payment (e.g. early-payment terms). Not
    // cash paid, but it still counts toward closing the PO's balance — see
    // PurchaseOrder.settlementDiscountTotal below.
    discountAmount: { type: Number },
    // Dealer Credit Control roadmap Module 4 — required whenever
    // discountAmount > 0 (enforced at the route, not here — this is a
    // sub-document, Mongoose can't easily cross-validate two of its own
    // sibling fields). lastPrice is the price before this discount, kept
    // for reference so the settlement's own justification is self-contained
    // without needing to look up history elsewhere.
    discountReason: { type: String, enum: SETTLEMENT_DISCOUNT_REASONS },
    lastPrice: { type: Number },
    // Simple manual reconciliation flag — see CustomerInvoice.ts's identical
    // fields (the other direction of money) for the full reasoning.
    reconciled: { type: Boolean, default: false },
    reconciledAt: { type: Date },
  }
  // No { _id: false } — same reasoning as CustomerInvoice.ts's
  // PaymentRecordSchema: reconciliation needs a stable per-entry id.
);

const PurchaseOrderSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    poNumber: { type: String, required: true },
    items: { type: [PurchaseOrderLineSchema], default: [] },
    // Always server-computed from `items` — no tax here, this is an
    // internal cost record (what the garage pays a supplier), not a
    // customer-facing tax document like Quotation/CustomerInvoice.
    subtotal: { type: Number, required: true },
    total: { type: Number, required: true },
    status: { type: String, enum: ['Draft', 'Ordered', 'Partially Received', 'Received', 'Cancelled'], default: 'Draft' },
    // Dealer Credit Control roadmap Module 4 — supplier payment terms for
    // this order, mandatory per the spec. Mirrors Customer.creditPeriodDays'
    // shape but on the purchase side, where nothing equivalent existed
    // before this — purely informational (doesn't drive any payment gate
    // today, matching how Customer.creditPeriodDays itself is just read by
    // dealerMetrics.ts/cron reporting rather than blocking anything).
    creditPeriodDays: { type: Number, required: true },
    expectedDate: { type: Date },
    receivedAt: { type: Date },
    notes: { type: String },
    // paidAmount/balance/paymentStatus are server-computed from
    // paymentHistory (api/_lib/purchaseOrderPayments.ts) — never set
    // directly by the client. Payments are only recordable once a PO is
    // Ordered or Received (a real commitment/delivery), never while Draft.
    paidAmount: { type: Number, default: 0 },
    // Cumulative sum of every payment's discountAmount — kept alongside
    // paidAmount (not merged into it) so "how much cash actually moved" and
    // "how much was written off as a settlement discount" stay separately
    // visible, same reasoning CustomerInvoice keeps subtotal/discountAmount/
    // taxAmount as distinct fields rather than folding them into one number.
    settlementDiscountTotal: { type: Number, default: 0 },
    balance: { type: Number, required: true },
    paymentStatus: { type: String, enum: ['Unpaid', 'Partial', 'Paid'], default: 'Unpaid' },
    paymentHistory: { type: [PaymentRecordSchema], default: [] },
    // Foundation for Phase 8's GL auto-posting — see Expense.ts's identical field.
    accountId: { type: Schema.Types.ObjectId, ref: 'ChartOfAccounts' },
  },
  { timestamps: true }
);

export type PurchaseOrderDoc = InferSchemaType<typeof PurchaseOrderSchema> & { _id: mongoose.Types.ObjectId };

export const PurchaseOrder = mongoose.models.PurchaseOrder || mongoose.model('PurchaseOrder', PurchaseOrderSchema);
