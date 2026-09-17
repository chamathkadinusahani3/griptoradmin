import mongoose, { Schema, InferSchemaType } from 'mongoose';

const StockIssueLineSchema = new Schema(
  {
    partId: { type: Schema.Types.ObjectId, ref: 'Part', required: true },
    // Snapshotted at issue time, same convention as Sale.items/Return.items
    // — the record still reads correctly even if the Part is later
    // renamed/deleted.
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    // Snapshotted from Part.price — this app has no separate cost-basis
    // field (Sale/Return/SalesOrder all value their own lines off
    // Part.price too), so that's the valuation used for the GL expense.
    unitPrice: { type: Number, required: true },
  },
  { _id: false }
);

// ERP-Phase 9 — parts leaving stock for a purpose OTHER than a sale
// (internal use, a department, non-job consumption) — distinct from
// StockAdjustment (a signed correction/shrinkage log, single part, no
// document number) and StockTransfer (moving the same SKU between
// branches/warehouses, net-zero across the tenant). A Stock Issue is a
// genuine one-way reduction with a real cost, so — per the Expense.ts
// template, not StockAdjustment's — it's a numbered document with its own
// GL posting: Dr 'Parts & Supplies Expense', Cr 'Inventory' for the
// issued value (see routes/stock-issues/index.ts).
const StockIssueSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    stockIssueNumber: { type: String, required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
    items: { type: [StockIssueLineSchema], default: [] },
    totalValue: { type: Number, required: true },
    // Free text — who/where the parts went. Deliberately not required to be
    // a formal Department (departmentId below is optional): plenty of real
    // issues won't map to an HR department at all (e.g. "damaged in
    // handling", "shop floor equipment repair").
    issuedTo: { type: String, required: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
    notes: { type: String },
  },
  { timestamps: true }
);

export type StockIssueDoc = InferSchemaType<typeof StockIssueSchema> & { _id: mongoose.Types.ObjectId };

export const StockIssue = mongoose.models.StockIssue || mongoose.model('StockIssue', StockIssueSchema);
