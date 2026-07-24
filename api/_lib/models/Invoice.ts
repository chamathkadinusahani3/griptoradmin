import mongoose, { Schema, InferSchemaType } from 'mongoose';

const InvoiceSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    plan: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['Paid', 'Pending', 'Failed'], required: true },
  },
  { timestamps: true }
);

export type InvoiceDoc = InferSchemaType<typeof InvoiceSchema> & { _id: mongoose.Types.ObjectId };

export const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema);
