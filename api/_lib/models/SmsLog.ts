import mongoose, { Schema, InferSchemaType } from 'mongoose';

const SmsLogSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    to: { type: String, required: true },
    message: { type: String, required: true },
    templateId: { type: Schema.Types.ObjectId, ref: 'MessageTemplate' },
    sent: { type: Boolean, required: true },
    error: { type: String },
  },
  { timestamps: true }
);

export type SmsLogDoc = InferSchemaType<typeof SmsLogSchema> & { _id: mongoose.Types.ObjectId };

export const SmsLog = mongoose.models.SmsLog || mongoose.model('SmsLog', SmsLogSchema);
