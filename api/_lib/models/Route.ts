import mongoose, { Schema, InferSchemaType } from 'mongoose';

// A delivery/sales route — a named grouping of towns/areas a salesperson
// and/or driver covers (e.g. "Route 01 — Main Town / Central Area").
// `salespersonId`/`driverId` are both optional: a route can exist before
// anyone is assigned to it. `driverId` references Employee — there's no
// separate Driver model, same reasoning as Salesperson.employeeId: Employee
// is already the generic staff record, a dedicated Driver model would just
// duplicate it.
const RouteSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    territory: { type: String },
    towns: { type: [String], default: [] },
    postalCodes: { type: [String], default: [] },
    salespersonId: { type: Schema.Types.ObjectId, ref: 'Salesperson' },
    driverId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  },
  { timestamps: true }
);

export type RouteDoc = InferSchemaType<typeof RouteSchema> & { _id: mongoose.Types.ObjectId };

export const RouteModel = mongoose.models.Route || mongoose.model('Route', RouteSchema);
