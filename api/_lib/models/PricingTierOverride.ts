import mongoose, { Schema, InferSchemaType } from 'mongoose';

const PricingTierOverrideSchema = new Schema(
  {
    tierId: { type: String, required: true, unique: true },
    features: { type: [String], required: true },
  },
  { timestamps: true }
);

export type PricingTierOverrideDoc = InferSchemaType<typeof PricingTierOverrideSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const PricingTierOverride =
  mongoose.models.PricingTierOverride || mongoose.model('PricingTierOverride', PricingTierOverrideSchema);
