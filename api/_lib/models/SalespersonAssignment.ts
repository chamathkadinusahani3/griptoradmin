import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const VISIT_FREQUENCIES = ['Daily', 'Weekly', 'Biweekly', 'Monthly'] as const;
export const ASSIGNMENT_PRIORITIES = ['High', 'Medium', 'Low'] as const;
export const VISIT_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

// Links one Salesperson to one Customer/shop they're responsible for.
// `routeId` references the 'Route' model added in SF-Phase 3; harmless to
// declare now since Mongoose refs aren't enforced at the DB level. A
// customer may have more than one active assignment (e.g. a primary rep
// plus a backup) — deliberately not unique, only exact-duplicate pairs are
// rejected at the route layer.
const SalespersonAssignmentSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    salespersonId: { type: Schema.Types.ObjectId, ref: 'Salesperson', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    territory: { type: String },
    routeId: { type: Schema.Types.ObjectId, ref: 'Route' },
    visitFrequency: { type: String, enum: VISIT_FREQUENCIES, default: 'Weekly' },
    preferredVisitDay: { type: String, enum: VISIT_DAYS },
    priority: { type: String, enum: ASSIGNMENT_PRIORITIES, default: 'Medium' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type SalespersonAssignmentDoc = InferSchemaType<typeof SalespersonAssignmentSchema> & { _id: mongoose.Types.ObjectId };

export const SalespersonAssignment =
  mongoose.models.SalespersonAssignment || mongoose.model('SalespersonAssignment', SalespersonAssignmentSchema);
