import mongoose, { Schema, InferSchemaType } from 'mongoose';

// An audit-trail entry, not a shared document like an Invoice/PO — no
// sequential number, just _id + timestamps, same as AuditLog.ts.
const StockAdjustmentSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    partId: { type: Schema.Types.ObjectId, ref: 'Part', required: true },
    // Signed — negative for shrinkage/damage/loss, positive for a found-stock
    // correction. previousStock/newStock are snapshotted so the log stays
    // readable even if the Part's current stock has since moved further.
    delta: { type: Number, required: true },
    previousStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    reason: { type: String, enum: ['Damage', 'Loss', 'Theft', 'Correction', 'Found', 'Stock count', 'Other'], required: true },
    notes: { type: String },
  },
  { timestamps: true }
);

export type StockAdjustmentDoc = InferSchemaType<typeof StockAdjustmentSchema> & { _id: mongoose.Types.ObjectId };

export const StockAdjustment = mongoose.models.StockAdjustment || mongoose.model('StockAdjustment', StockAdjustmentSchema);
