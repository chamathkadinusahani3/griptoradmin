import mongoose, { Schema, InferSchemaType } from 'mongoose';

const MediaSchema = new Schema(
  {
    url: { type: String, required: true },
    type: { type: String, enum: ['image', 'video'], required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const InspectionSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    technicianId: { type: Schema.Types.ObjectId, ref: 'Technician', required: true },
    jobCardId: { type: Schema.Types.ObjectId, ref: 'JobCard' },
    vehicle: { type: String, required: true },
    plate: { type: String },
    result: { type: String, enum: ['Pass', 'Advisory', 'Fail'], required: true },
    media: { type: [MediaSchema], default: [] },
    items: { type: Number, default: 0 },
    notes: { type: String },
    // Extra work found during inspection that needs the customer to sign off
    // before proceeding — most inspections (especially Pass results) won't
    // have this, so approval fields below stay 'not_required' by default.
    additionalCost: { type: Number },
    approvalStatus: {
      type: String,
      enum: ['not_required', 'pending', 'approved', 'rejected'],
      default: 'not_required',
    },
    // A real random opaque secret for the public approval link — deliberately
    // NOT the document _id (an ObjectId is guessable/enumerable; this isn't).
    approvalToken: { type: String },
    approvalRequestedAt: { type: Date },
    approvalRespondedAt: { type: Date },
  },
  { timestamps: true }
);

export type InspectionDoc = InferSchemaType<typeof InspectionSchema> & { _id: mongoose.Types.ObjectId };

export const Inspection = mongoose.models.Inspection || mongoose.model('Inspection', InspectionSchema);
