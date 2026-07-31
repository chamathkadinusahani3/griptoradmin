import mongoose, { Schema, InferSchemaType } from 'mongoose';

const BreakLogSchema = new Schema(
  {
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
  },
  { _id: false }
);

// One document per subject per day (upserted) — clientId+technicianId/userId+date
// together are the natural unique key, enforced at the query layer (same
// reasoning as before) rather than a compound unique index.
//
// technicianId/userId: exactly one of the two is set per doc, enforced at
// the API layer (api/_lib/routes/technicians/[id]/attendance.ts for the
// original Technician-resource flow; api/_lib/routes/attendance/me.ts for
// the newer self-service flow covering any staff User — Owner/Manager/
// Cashier, who may have no Technician doc at all, confirmed a separate,
// unlinked collection). Both optional rather than a polymorphic single
// field so existing Technician-keyed rows and every query against them
// (notably Payroll's) needed zero migration.
const AttendanceSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    technicianId: { type: Schema.Types.ObjectId, ref: 'Technician' },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    date: { type: String, required: true }, // YYYY-MM-DD
    status: { type: String, enum: ['active', 'on_break', 'off'], default: 'off' },
    clockInAt: { type: Date },
    clockOutAt: { type: Date },
    breakLogs: { type: [BreakLogSchema], default: [] },
  },
  { timestamps: true }
);

export type AttendanceDoc = InferSchemaType<typeof AttendanceSchema> & { _id: mongoose.Types.ObjectId };

export const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', AttendanceSchema);
