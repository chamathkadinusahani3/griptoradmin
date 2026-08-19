import mongoose, { Schema, InferSchemaType } from 'mongoose';

// Promotes one PayrollRun line into its own real document, created
// automatically when a run is finalized (payroll-runs/[id].ts) — closes
// the gap flagged in the roadmap: downloadPayslipPdf() in src/lib/pdf.ts
// was client-side-only with nothing stored, so there was no way to list
// "every payslip for this person" independent of digging through
// PayrollRun documents. The PDF itself still generates client-side on
// demand from this document's data (same "no server-side PDF
// generation/storage" convention pdf.ts already documents) — "persisted"
// here means the DATA survives as a queryable record, not that a PDF file
// is stored anywhere.
const PayslipSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    payrollRunId: { type: Schema.Types.ObjectId, ref: 'PayrollRun', required: true },
    technicianId: { type: Schema.Types.ObjectId, ref: 'Technician' },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    subjectName: { type: String, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    hourlyRate: { type: Number },
    hoursWorked: { type: Number, required: true },
    grossPay: { type: Number, required: true },
    missingRate: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type PayslipDoc = InferSchemaType<typeof PayslipSchema> & { _id: mongoose.Types.ObjectId };

export const Payslip = mongoose.models.Payslip || mongoose.model('Payslip', PayslipSchema);
