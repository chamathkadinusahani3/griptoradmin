import mongoose, { Schema, InferSchemaType } from 'mongoose';

const StockCountLineSchema = new Schema(
  {
    partId: { type: Schema.Types.ObjectId, ref: 'Part', required: true },
    // Snapshotted at count-start time, same "record what was true when
    // work began" convention as PurchaseOrderLineSchema's name snapshot —
    // the count still reads correctly even if the Part's stock moves
    // (a sale, another transfer) while the count is in progress.
    name: { type: String, required: true },
    systemQty: { type: Number, required: true },
    // null until a staff member actually walks the shelf and enters it.
    countedQty: { type: Number, default: null },
  },
  { _id: false }
);

const StockCountSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
    status: { type: String, enum: ['Open', 'Finalized'], default: 'Open' },
    lines: { type: [StockCountLineSchema], default: [] },
    finalizedAt: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
);

export type StockCountDoc = InferSchemaType<typeof StockCountSchema> & { _id: mongoose.Types.ObjectId };

export const StockCount = mongoose.models.StockCount || mongoose.model('StockCount', StockCountSchema);
