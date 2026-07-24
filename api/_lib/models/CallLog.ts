import mongoose, { Schema, InferSchemaType } from 'mongoose';

const CallLogSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    direction: { type: String, enum: ['Inbound', 'Outbound'], required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['Open', 'Resolved', 'Escalated'], default: 'Open' },
    // Real number, not Anura's free-text duration field.
    durationMinutes: { type: Number },
    notes: { type: String },
    followUpDue: { type: Date },
    // Set when followUpDue creates a real linked Reminder (api/call-logs/index.ts).
    reminderId: { type: Schema.Types.ObjectId, ref: 'Reminder' },
  },
  { timestamps: true }
);

export type CallLogDoc = InferSchemaType<typeof CallLogSchema> & { _id: mongoose.Types.ObjectId };

export const CallLog = mongoose.models.CallLog || mongoose.model('CallLog', CallLogSchema);
