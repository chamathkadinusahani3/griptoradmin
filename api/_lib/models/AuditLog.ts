import mongoose, { Schema, InferSchemaType } from 'mongoose';

const AUDIT_ACTIONS = ['user.create', 'user.update', 'user.activate', 'user.deactivate', 'user.reset_password', 'user.delete'] as const;

// A real, unconditional audit trail for Super-Admin-driven actions against a
// tenant's staff accounts — same "never opt-in for a sensitive action"
// discipline already established by ImpersonationLog/Approval/LeaveRequest.
// No viewer UI yet (matches ImpersonationLog's own precedent: recorded now,
// surfaced later if needed) — this is the write side only.
const AuditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorName: { type: String, required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    targetUserName: { type: String },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export type AuditLogDoc = InferSchemaType<typeof AuditLogSchema> & { _id: mongoose.Types.ObjectId };

export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
