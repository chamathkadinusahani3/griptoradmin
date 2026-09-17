import mongoose, { Schema, InferSchemaType } from 'mongoose';

const PartSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    name: { type: String, required: true },
    sku: { type: String },
    barcode: { type: String },
    category: { type: String, required: true },
    stock: { type: Number, default: 0 },
    reorderAt: { type: Number, default: 0 },
    price: { type: Number, default: 0 },
    // Cost basis (what the garage paid), separate from `price` (what it
    // sells for) — used for per-line margin visibility on documents like
    // Sales Orders. Defaults to 0 so every part created before this field
    // existed just shows zero cost rather than breaking anything.
    cost: { type: Number, default: 0 },
    // Sales Module Phase 7 — an optional price floor enforced at Sales Order
    // creation (the only document with real Part references — see
    // discountGovernance.ts). Unset (the default) means no floor, zero
    // behavior change for every part that predates this field.
    minSellingPrice: { type: Number },
    // Sales Module Phase 15 — optional, most relevant for batteries/parts
    // with a real batch/lot or serial identity and a shelf life. A Part
    // document already represents one independently-stocked line (see
    // branchId/warehouseId's own "different identity = different document"
    // convention above) — a business tracking distinct batches of the same
    // SKU is expected to create a separate Part per batch, the same way
    // they already would per branch/warehouse, rather than this app
    // maintaining a second per-batch stock ledger underneath one Part.
    // Snapshotted onto Sale/SalesOrder/GoodsReceivedNote line items at
    // transaction time (see those models' own comments) so the historical
    // record survives even if this Part's fields are later changed.
    batchNumber: { type: String },
    serialNumber: { type: String },
    expiryDate: { type: Date },
    // Cubic feet per unit — used by Sales Force Management's delivery load
    // calculation (Σ unitVolume × quantity per delivery). Defaults to 0 so
    // every part created before this field existed just contributes zero
    // volume rather than breaking the calculation.
    unitVolume: { type: Number, default: 0 },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    // The real fix for Anura's inventory gap: their reference has ONE
    // global quantity company-wide with `location` just a shelf-label
    // string. Here the same SKU at two branches is two independent Part
    // documents, each with its own real `stock` — genuine per-branch
    // inventory, not a display label.
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    // Same "real independent document per location" reasoning as branchId,
    // one level finer — the same SKU in two Warehouses of the SAME Branch is
    // two independent Part documents, each with its own real `stock`, so a
    // Stock Transfer between them is a genuine move (decrement one document,
    // increment/create the other) rather than a label change.
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
    // Edge-triggered de-dup for the daily low-stock SMS scan
    // (api/_lib/routes/cron/daily.ts) — true from the moment stock first
    // drops to/below reorderAt until it's restocked back above it, so the
    // same low-stock episode never re-alerts every single day.
    lowStockAlertActive: { type: Boolean, default: false },
    lastAlertedAt: { type: Date },
  },
  { timestamps: true }
);

export type PartDoc = InferSchemaType<typeof PartSchema> & { _id: mongoose.Types.ObjectId };

export const Part = mongoose.models.Part || mongoose.model('Part', PartSchema);
