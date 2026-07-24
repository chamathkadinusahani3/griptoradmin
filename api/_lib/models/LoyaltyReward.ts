import mongoose, { Schema, InferSchemaType } from 'mongoose';

const LoyaltyRewardSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    name: { type: String, required: true },
    pointsCost: { type: Number, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type LoyaltyRewardDoc = InferSchemaType<typeof LoyaltyRewardSchema> & { _id: mongoose.Types.ObjectId };

export const LoyaltyReward = mongoose.models.LoyaltyReward || mongoose.model('LoyaltyReward', LoyaltyRewardSchema);
