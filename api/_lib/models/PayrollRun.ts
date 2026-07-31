import mongoose, { Schema, InferSchemaType } from 'mongoose';

const PayrollLineSchema = new Schema(
  {
    technicianId: { type: Schema.Types.ObjectId, ref: 'Technician', required: true },
    // Snapshotted at generation time — a payroll run must never silently
    // reflow if the technician's name/rate changes later, same reasoning as
    // Quotation.discountPct being fixed at creation rather than re-read live.
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
