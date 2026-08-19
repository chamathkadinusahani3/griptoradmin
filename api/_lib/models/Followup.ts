import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const FOLLOWUP_TYPES = ['Call', 'Email', 'Meeting', 'Other'] as const;

// A first-class follow-up task, replacing the old piggyback pattern where
// CallLog.followUpDue silently spawned a generic Reminder (CallLog.ts's own
// comment) — that path stays untouched for existing records (no migration),
// but every NEW follow-up should go through this instead: a real
// owner/assignee, its own status, and a subject that can be either an
// existing Customer or a not-yet-converted Prospect.
const FollowupSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    prospectId: { type: Schema.Types.ObjectId, ref: 'Prospect' },
    // Snapshotted at creation — same "record what was true when created"
    // convention as every other subject-name snapshot in this codebase
    // (PurchaseOrderLineSchema.name, SalaryAdvance.subjectName, ...).
    subjectName: { type: String, required: true },
    dueDate: { type: Date, required: true },
    type: { type: String, enum: FOLLOWUP_TYPES, default: 'Call' },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['Pending', 'Completed', 'Cancelled'], default: 'Pending' },
    completedAt: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
);

export type FollowupDoc = InferSchemaType<typeof FollowupSchema> & { _id: mongoose.Types.ObjectId };

export const Followup = mongoose.models.Followup || mongoose.model('Followup', FollowupSchema);
