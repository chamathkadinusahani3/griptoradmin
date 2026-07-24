import mongoose, { Schema, InferSchemaType } from 'mongoose';

const ReminderSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    vehicle: { type: String },
    type: { type: String, required: true },
    channel: { type: String, enum: ['SMS', 'WhatsApp', 'Email'], required: true },
    status: { type: String, enum: ['Scheduled', 'Sent', 'Failed'], default: 'Scheduled' },
    scheduledFor: { type: Date, required: true },
  },
  { timestamps: true }
);

export type ReminderDoc = InferSchemaType<typeof ReminderSchema> & { _id: mongoose.Types.ObjectId };

export const Reminder = mongoose.models.Reminder || mongoose.model('Reminder', ReminderSchema);
