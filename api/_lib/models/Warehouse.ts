import mongoose, { Schema, InferSchemaType } from 'mongoose';

// A named stock location (e.g. a garage's front counter shelf vs. its back
// storeroom) — optionally nested inside a Branch when the tenant also uses
// Multi-location Support, but branchId is deliberately NOT required:
// Warehouses is a core Inventory feature that must work standalone even for
// a tenant who never enabled the (separately paid, gms-multi) Branches
// add-on. Entirely optional overall, same "every field elsewhere is
// optional" discipline as Branch itself — a tenant who never creates a
// Warehouse is completely unaffected (Part.warehouseId stays unset, stock
// behaves exactly as it did before this model existed).
const WarehouseSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    name: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type WarehouseDoc = InferSchemaType<typeof WarehouseSchema> & { _id: mongoose.Types.ObjectId };

export const Warehouse = mongoose.models.Warehouse || mongoose.model('Warehouse', WarehouseSchema);
