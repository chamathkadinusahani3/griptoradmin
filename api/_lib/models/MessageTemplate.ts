import mongoose, { Schema, InferSchemaType } from 'mongoose';

// body supports {name}/{vehicle}/{date} interpolation, filled in at send
// time (api/sms/send.ts) — same simple placeholder scheme Anura validated.
const MessageTemplateSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    name: { type: String, required: true },
    body: { type: String, required: true },
  },
  { timestamps: true }
);

export type MessageTemplateDoc = InferSchemaType<typeof MessageTemplateSchema> & { _id: mongoose.Types.ObjectId };

export const MessageTemplate = mongoose.models.MessageTemplate || mongoose.model('MessageTemplate', MessageTemplateSchema);
