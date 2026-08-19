import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract'] as const;

// A third, additional collection alongside User (login identity) and
// Technician (schedulable resource) — same "one collection per concern"
// pattern already used throughout this app. Not every staff member has one
// immediately; created/edited on demand from the HRM > Employees page.
const EmployeeSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    dateOfBirth: { type: Date },
    address: { type: String },
    nationalId: { type: String },
    emergencyContactName: { type: String },
    emergencyContactPhone: { type: String },
    hireDate: { type: Date },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, default: 'Full-time' },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
    // Same hourly-rate-times-clocked-hours model as Technician.hourlyRate —
    // Payroll (Phase 9) treats every subject as hourly, no separate
    // salaried-employee computation path. Attendance rows keyed by this
    // employee's own userId (the existing self-service clock-in/out flow,
    // attendance/me.ts) are what payroll generation sums against; no new
    // attendance tracking was needed to extend payroll to Employees.
    hourlyRate: { type: Number },
    // Lets a departed employee's record be excluded from future payroll
    // generation without deleting their history — same field/reasoning as
    // Technician.active.
    active: { type: Boolean, default: true },
    notes: { type: String },
  },
  { timestamps: true }
);

export type EmployeeDoc = InferSchemaType<typeof EmployeeSchema> & { _id: mongoose.Types.ObjectId };

export const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema);
