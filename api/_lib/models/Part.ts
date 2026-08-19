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
