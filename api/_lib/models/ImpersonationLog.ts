import mongoose, { Schema, InferSchemaType } from 'mongoose';

// A real audit trail for a genuinely sensitive action (a platform team
// member gaining full access to a live tenant's account) — every start is
// logged unconditionally, never opt-in, same "never trust a sensitive
// action without a server-written record" discipline as Approval/LeaveRequest.
const ImpersonationLogSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    tenantUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    superAdminUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    startedAt: { type: Date, required: true, default: Date.now },
    endedAt: { type: Date },
  },
  { timestamps: true }
);

export type ImpersonationLogDoc = InferSchemaType<typeof ImpersonationLogSchema> & { _id: mongoose.Types.ObjectId };

export const ImpersonationLog = mongoose.models.ImpersonationLog || mongoose.model('ImpersonationLog', ImpersonationLogSchema);
