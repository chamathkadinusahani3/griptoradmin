import mongoose, { Schema, InferSchemaType } from 'mongoose';

// A weekly/per-period ROLLUP-AND-APPROVAL document, distinct from raw
// Attendance clock rows — totalHours is snapshotted from Attendance at
// submission time (same "record what was true when work began" reasoning
// as StockCountLine.systemQty), then a Manager approves or rejects the
// period as a whole rather than each individual clock event.
const TimesheetSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    technicianId: { type: Schema.Types.ObjectId, ref: 'Technician' },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    subjectName: { type: String, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    totalHours: { type: Number, required: true },
    status: { type: String, enum: ['Submitted', 'Approved', 'Rejected'], default: 'Submitted' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    rejectionReason: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

export type TimesheetDoc = InferSchemaType<typeof TimesheetSchema> & { _id: mongoose.Types.ObjectId };

export const Timesheet = mongoose.models.Timesheet || mongoose.model('Timesheet', TimesheetSchema);
