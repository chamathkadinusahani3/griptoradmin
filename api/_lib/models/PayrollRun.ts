import mongoose, { Schema, InferSchemaType } from 'mongoose';

const PayrollLineSchema = new Schema(
  {
    // Exactly one of technicianId/employeeId is set per line (same optional-
    // pair convention as Attendance.technicianId/userId) — Phase 9 extended
    // payroll to cover Employees without a schema migration: technicianId
    // went from required to optional, employeeId is new, and every
    // pre-Phase-9 line (which only ever had technicianId) still reads
    // correctly with employeeId simply absent.
    technicianId: { type: Schema.Types.ObjectId, ref: 'Technician' },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    // Snapshotted at generation time — a payroll run must never silently
    // reflow if the subject's name/rate changes later, same reasoning as
    // Quotation.discountPct being fixed at creation rather than re-read
    // live. Field name kept as `technicianName` (not renamed to something
    // generic) to avoid a migration — it holds the subject's display name
    // regardless of whether the line is a technician or an employee.
    technicianName: { type: String, required: true },
    hourlyRate: { type: Number },
    hoursWorked: { type: Number, required: true },
    grossPay: { type: Number, required: true },
    // True when hourlyRate was unset at generation time — grossPay is 0 in
    // that case, never a guessed rate, and the UI must surface this loudly
    // rather than let it pass as "this technician earned $0."
    missingRate: { type: Boolean, default: false },
  },
  { _id: false }
);

const PayrollRunSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    status: { type: String, enum: ['Draft', 'Finalized', 'Paid'], default: 'Draft' },
    lines: { type: [PayrollLineSchema], default: [] },
    totalAmount: { type: Number, required: true },
    finalizedAt: { type: Date },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

export type PayrollRunDoc = InferSchemaType<typeof PayrollRunSchema> & { _id: mongoose.Types.ObjectId };

export const PayrollRun = mongoose.models.PayrollRun || mongoose.model('PayrollRun', PayrollRunSchema);
