import mongoose, { Schema, InferSchemaType } from 'mongoose';

const DeliveryNoteLineSchema = new Schema(
  {
    partId: { type: Schema.Types.ObjectId, ref: 'Part', required: true },
    name: { type: String, required: true },
    quantityDelivered: { type: Number, required: true },
  },
  { _id: false }
);

// The goods-issued record — created every time a SalesOrder is fulfilled
// (sales-orders/[id]/fulfill.ts), the sales-side mirror of
// GoodsReceivedNote.ts. A single SalesOrder can have more than one
// DeliveryNote against it (partial fulfillment across multiple pickups).
const DeliveryNoteSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    deliveryNoteNumber: { type: String, required: true },
    salesOrderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    items: { type: [DeliveryNoteLineSchema], default: [] },
    notes: { type: String },
  },
  { timestamps: true }
);

export type DeliveryNoteDoc = InferSchemaType<typeof DeliveryNoteSchema> & { _id: mongoose.Types.ObjectId };

export const DeliveryNote = mongoose.models.DeliveryNote || mongoose.model('DeliveryNote', DeliveryNoteSchema);
