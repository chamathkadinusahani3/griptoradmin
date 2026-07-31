import mongoose, { Schema, InferSchemaType } from 'mongoose';

const PerformanceReviewSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    employeeUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Always session.sub server-side (api/_lib/routes/performance-reviews/index.ts)
    // — never trusted from the client, same discipline as Approval.requestedBy.
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewDate: { type: Date, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    feedback: { type: String, required: true },
  },
  { timestamps: true }
);

export type PerformanceReviewDoc = InferSchemaType<typeof PerformanceReviewSchema> & { _id: mongoose.Types.ObjectId };

export const PerformanceReview = mongoose.models.PerformanceReview || mongoose.model('PerformanceReview', PerformanceReviewSchema);
