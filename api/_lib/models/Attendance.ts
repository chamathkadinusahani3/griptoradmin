import mongoose, { Schema, InferSchemaType } from 'mongoose';

const BreakLogSchema = new Schema(
  {
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
  },
  { _id: false }
);

// One document per technician per day (upserted) — clientId+technicianId+date
// together are the natural unique key, enforced at the query layer in
// api/technicians/[id]/attendance.ts rather than a compound unique index,
// since Mongoose doesn't make a partial/compound unique index trivial here
// and the upsert-by-filter pattern already guarantees at most one per day.
const AttendanceSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    technicianId: { type: Schema.Types.ObjectId, ref: 'Technician', required: true },
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
