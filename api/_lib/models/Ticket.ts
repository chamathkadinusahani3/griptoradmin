import mongoose, { Schema, InferSchemaType } from 'mongoose';

const TicketMessageSchema = new Schema(
  {
    author: { type: String, required: true },
    role: { type: String, enum: ['client', 'agent'], required: true },
    text: { type: String, required: true },
    time: { type: Date, required: true },
  },
  { _id: false }
);

const TicketSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    subject: { type: String, required: true },
    priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], required: true },
    status: { type: String, enum: ['Open', 'Pending', 'Resolved'], default: 'Open' },
    assignee: { type: String, required: true },
    thread: { type: [TicketMessageSchema], default: [] },
  },
  { timestamps: true }
);

export type TicketDoc = InferSchemaType<typeof TicketSchema> & { _id: mongoose.Types.ObjectId };

export const Ticket = mongoose.models.Ticket || mongoose.model('Ticket', TicketSchema);
