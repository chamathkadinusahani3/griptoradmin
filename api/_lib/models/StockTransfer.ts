import mongoose, { Schema, InferSchemaType } from 'mongoose';

// A record of stock actually moved between two Part documents (see
// Part.ts's comment — the same SKU in two Warehouses is two independent
// documents). Transfers take effect immediately on creation, same as
// Return — there's no Draft/pending workflow, this is a log of a move that
// already happened, not a request awaiting fulfillment.
const StockTransferSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    fromPartId: { type: Schema.Types.ObjectId, ref: 'Part', required: true },
    toPartId: { type: Schema.Types.ObjectId, ref: 'Part', required: true },
    toWarehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    quantity: { type: Number, required: true },
    notes: { type: String },
  },
  { timestamps: true }
);

export type StockTransferDoc = InferSchemaType<typeof StockTransferSchema> & { _id: mongoose.Types.ObjectId };

export const StockTransfer = mongoose.models.StockTransfer || mongoose.model('StockTransfer', StockTransferSchema);
