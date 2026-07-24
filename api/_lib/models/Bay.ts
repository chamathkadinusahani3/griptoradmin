import mongoose, { Schema, InferSchemaType } from 'mongoose';

// Deliberately minimal — no stored status/occupant field. Whether a bay is
// free or occupied is computed at read time from JobCard.bayId, the same
// "derive, don't store" discipline used for Technician.activeJobs — storing
// occupancy redundantly here too is exactly the bug confirmed in the Anura
// reference (bay state drifting between two collections).
const BaySchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    name: { type: String, required: true },
    // Optional — only meaningful for gms-multi tenants. A bay is physically
    // at one branch, no "shared" concept needed (same as Technician/Part).
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true }
);

export type BayDoc = InferSchemaType<typeof BaySchema> & { _id: mongoose.Types.ObjectId };

export const Bay = mongoose.models.Bay || mongoose.model('Bay', BaySchema);
