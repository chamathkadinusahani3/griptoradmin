import mongoose, { Schema, InferSchemaType } from 'mongoose';

const TechnicianSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    name: { type: String, required: true },
    specialty: { type: String, required: true },
    status: { type: String, enum: ['Available', 'Busy', 'On Break', 'Off Duty'], default: 'Available' },
    avatar: { type: String },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    // What an hour of this technician's time actually costs the shop — no
    // rate/compensation field existed anywhere before this.
    hourlyRate: { type: Number },
    // The real, staff-editable version of what used to be a hardcoded `4`
    // in Technicians.tsx's workload-percentage calculation.
    maxConcurrentJobs: { type: Number, default: 4 },
    // Deactivate rather than hard-delete — a technician has real historical
    // JobCard/Attendance references a hard delete would orphan. Same
    // pattern as Service.active/LoyaltyReward.active.
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type TechnicianDoc = InferSchemaType<typeof TechnicianSchema> & { _id: mongoose.Types.ObjectId };

export const Technician = mongoose.models.Technician || mongoose.model('Technician', TechnicianSchema);
