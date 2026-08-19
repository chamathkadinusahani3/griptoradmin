import mongoose, { Schema, InferSchemaType } from 'mongoose';

// A standalone, self-contained cash advance to staff — deliberately does
// NOT auto-deduct from a future PayrollRun (that would require splitting
// gross pay from net cash disbursed throughout Phase 8's payroll GL
// posting, a real scope increase beyond what the roadmap named). Approving
// an advance pays it out immediately and posts its own clean GL entry
// (Dr Employee Advances / Cr Cash or Bank) — recovering it via a payroll
// deduction is a real, but deliberately deferred, future enhancement.
const SalaryAdvanceSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    advanceNumber: { type: String, required: true },
    technicianId: { type: Schema.Types.ObjectId, ref: 'Technician' },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    subjectName: { type: String, required: true },
    amount: { type: Number, required: true },
    reason: { type: String },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    paymentMethod: { type: String, enum: ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Other'] },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectionReason: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

export type SalaryAdvanceDoc = InferSchemaType<typeof SalaryAdvanceSchema> & { _id: mongoose.Types.ObjectId };

export const SalaryAdvance = mongoose.models.SalaryAdvance || mongoose.model('SalaryAdvance', SalaryAdvanceSchema);
