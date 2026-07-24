import mongoose, { Schema, InferSchemaType } from 'mongoose';

const LeadSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    company: { type: String },
    businessType: { type: String },
    message: { type: String, required: true },
    status: { type: String, enum: ['New', 'Contacted', 'Converted'], default: 'New' },
  },
  { timestamps: true }
);

export type LeadDoc = InferSchemaType<typeof LeadSchema> & { _id: mongoose.Types.ObjectId };

export const Lead = mongoose.models.Lead || mongoose.model('Lead', LeadSchema);
