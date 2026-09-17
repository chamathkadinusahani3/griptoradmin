import mongoose, { Schema, InferSchemaType } from 'mongoose';

// Deliberately its own model, not a field on Employee — same reasoning as
// Technician being separate from Employee/User: a Salesperson is a field-ops
// role that may or may not correspond to a staff Employee record.
// `routeId` references the 'Route' model added in SF-Phase 3; harmless to
// declare now since Mongoose refs aren't enforced at the DB level.
const SalespersonSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    mobile: { type: String },
    email: { type: String },
    territory: { type: String },
    routeId: { type: Schema.Types.ObjectId, ref: 'Route' },
    target: { type: Number, default: 0 },
    // Sales Module Phase 9 — revenue-based only for this first cut. The
    // commission amount itself is never stored: it's derived on read
    // (commissionAmount = actualSales × commissionPct / 100) by
    // sf-salesperson-report.ts, reusing the exact same computeActualSales()
    // sum SalesTarget's achievement% already relies on. Default 0 means "no
    // commission configured," zero behavior change for every salesperson
    // that predates this field.
    commissionPct: { type: Number, default: 0 },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    gpsTrackingEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type SalespersonDoc = InferSchemaType<typeof SalespersonSchema> & { _id: mongoose.Types.ObjectId };

export const Salesperson = mongoose.models.Salesperson || mongoose.model('Salesperson', SalespersonSchema);
