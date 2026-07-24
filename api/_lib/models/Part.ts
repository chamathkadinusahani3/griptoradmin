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
  },
  { timestamps: true }
);

export type PartDoc = InferSchemaType<typeof PartSchema> & { _id: mongoose.Types.ObjectId };

export const Part = mongoose.models.Part || mongoose.model('Part', PartSchema);
