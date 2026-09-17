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
//
// ERP-Phase 4: doubles as the "DAG" (delivery advice) when the tenant has
// opted into Client.requireDeliveryConfirm — status defaults to 'Confirmed'
// so every pre-Phase-4 record, and every record created while the
// kill-switch is off, is indistinguishable from before this field existed.
// Only when the kill-switch is on does fulfill.ts create one with status
// 'Pending' instead (no stock/Sale side effects yet — see
// delivery-notes/[id]/confirm.ts for where those actually happen).
const DeliveryNoteSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    deliveryNoteNumber: { type: String, required: true },
    salesOrderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    items: { type: [DeliveryNoteLineSchema], default: [] },
    notes: { type: String },
    // Sales Module Phase 5 — 'Picked'/'Packed' are OPTIONAL intermediate
    // waypoints a Pending (DAG-mode) note can move through before the
    // existing 'Confirmed' step — confirm.ts still accepts confirming
    // directly from 'Pending' too, so a tenant that doesn't use picking
    // sees byte-identical behavior to before this phase. Only meaningful in
    // DAG mode (Client.requireDeliveryConfirm) — a non-DAG note is created
    // straight at 'Confirmed' and never passes through these at all.
    status: { type: String, enum: ['Pending', 'Picked', 'Packed', 'Confirmed', 'Cancelled'], default: 'Confirmed' },
    confirmedAt: { type: Date },
    // Proof of delivery — captured at whichever step actually finalizes the
    // handoff (confirm.ts in DAG mode, or fulfill.ts's non-DAG atomic path).
    // All optional; a tenant that doesn't capture proof leaves these unset,
    // same "additive, zero behavior change" discipline as everywhere else.
    // signatureDataUrl/photoDataUrl are small base64 data: URLs stored
    // directly on the document — the same convention already established
    // for Client.branding.logoDataUrl, not the separate attachment-storage
    // system reserved for a later phase.
    receiverName: { type: String },
    receiverPhone: { type: String },
    signatureDataUrl: { type: String },
    photoDataUrl: { type: String },
  },
  { timestamps: true }
);

export type DeliveryNoteDoc = InferSchemaType<typeof DeliveryNoteSchema> & { _id: mongoose.Types.ObjectId };

export const DeliveryNote = mongoose.models.DeliveryNote || mongoose.model('DeliveryNote', DeliveryNoteSchema);
