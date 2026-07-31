import mongoose, { Schema, InferSchemaType } from 'mongoose';

const PricingTierSchema = new Schema(
  {
    tierId: { type: String, required: true, unique: true },
    name: { type: String, required: true, unique: true },
    // null = "Custom" pricing (shown instead of a number) — same convention
    // Enterprise already used when this lived in the static PRICING_TIERS array.
    price: { type: Number },
    cadence: { type: String, default: '/mo' },
    popular: { type: Boolean, default: false },
    description: { type: String, default: '' },
    features: { type: [String], default: [] },
    // Display order — new tiers are appended after existing ones rather than
    // sorted alphabetically/by price, so Starter/Professional/Enterprise
    // keep their current relative order after the seed migration.
    sortOrder: { type: Number, required: true },
    // Admin-facing intent only — griptorweb's public Pricing page has its
    // own separate, hardcoded plan list with no connection to this
    // collection, so toggling this does NOT yet change what's shown on the
    // live public site. Stored now so the data exists once/if that
    // connection is built later.
    hidden: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type PricingTierDoc = InferSchemaType<typeof PricingTierSchema> & { _id: mongoose.Types.ObjectId };

export const PricingTier = mongoose.models.PricingTier || mongoose.model('PricingTier', PricingTierSchema);
