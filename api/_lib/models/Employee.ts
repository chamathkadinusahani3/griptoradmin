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
    notes: { type: String },
  },
  { timestamps: true }
);

export type EmployeeDoc = InferSchemaType<typeof EmployeeSchema> & { _id: mongoose.Types.ObjectId };

export const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema);
