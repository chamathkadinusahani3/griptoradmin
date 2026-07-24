import mongoose, { Schema, InferSchemaType } from 'mongoose';

const SupplierSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    name: { type: String, required: true },
    contact: { type: String },
    email: { type: String },
    openOrders: { type: Number, default: 0 },
    lastOrder: { type: Date },
    onTime: { type: Number },
  },
  { timestamps: true }
);

export type SupplierDoc = InferSchemaType<typeof SupplierSchema> & { _id: mongoose.Types.ObjectId };

export const Supplier = mongoose.models.Supplier || mongoose.model('Supplier', SupplierSchema);
