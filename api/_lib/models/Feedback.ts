import mongoose, { Schema, InferSchemaType } from 'mongoose';

const FeedbackSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    service: { type: String },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String },
    responded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type FeedbackDoc = InferSchemaType<typeof FeedbackSchema> & { _id: mongoose.Types.ObjectId };

export const Feedback = mongoose.models.Feedback || mongoose.model('Feedback', FeedbackSchema);
