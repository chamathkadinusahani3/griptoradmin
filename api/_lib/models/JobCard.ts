import mongoose, { Schema, InferSchemaType } from 'mongoose';

const ChecklistItemSchema = new Schema(
  {
    label: { type: String, required: true },
    done: { type: Boolean, default: false },
  },
  { _id: false }
);

// Snapshot pattern — same as Sale.items/Quotation line items — captures the
// part's name/price at the moment it was used on this job, so a later price
// change on the Part catalog doesn't retroactively alter a past job's cost.
const PartUsedSchema = new Schema(
  {
    partId: { type: Schema.Types.ObjectId, ref: 'Part', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    qty: { type: Number, required: true },
  },
  { _id: false }
);

const JobCardSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    vehicle: { type: String, required: true },
    plate: { type: String },
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle' },
    service: { type: String },
    technicianId: { type: Schema.Types.ObjectId, ref: 'Technician', required: true },
    // The quoted/expected amount — kept as a simple staff-entered figure
    // (see partsUsed/laborCost below for the real actual-cost tracking).
    estimate: { type: Number, default: 0 },
    status: { type: String, enum: ['New', 'In Progress', 'Awaiting Parts', 'Completed', 'Cancelled'], default: 'New' },
    checklist: { type: [ChecklistItemSchema], default: [] },
    bayId: { type: Schema.Types.ObjectId, ref: 'Bay' },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    // Real parts consumption — added via api/job-cards/[id]/parts.ts, which
    // atomically decrements the real Part.stock in the same transaction.
    // Never edited directly here.
    partsUsed: { type: [PartUsedSchema], default: [] },
    // A flat labor charge for the job — no technician hourly-rate system
    // exists in this app, so this is the honest scope (not time × rate).
    laborCost: { type: Number, default: 0 },
    // Stamped automatically on status transitions (api/job-cards/[id].ts) —
    // never set directly by the client.
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

export type JobCardDoc = InferSchemaType<typeof JobCardSchema> & { _id: mongoose.Types.ObjectId };

export const JobCard = mongoose.models.JobCard || mongoose.model('JobCard', JobCardSchema);
