import mongoose, { Schema, InferSchemaType } from 'mongoose';

// A real ticket workflow — deliberately separate from Feedback.ts (post-
// service star ratings, no status/resolution) and from Approval.ts's
// generic 'Warranty Claim' type (a one-shot yes/no request, not a tracked
// issue). Covers both directions: a customer complaining to the garage, or
// the garage complaining to a supplier.
const ComplaintSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    direction: { type: String, enum: ['customer', 'supplier'], required: true },
    // Exactly one of these is set, matching `direction` — enforced at the
    // write boundary (routes/complaints/index.ts), not here.
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    complaintNumber: { type: String, required: true },
    category: { type: String, enum: ['Quality', 'Service', 'Billing', 'Delivery', 'Communication', 'Other'], required: true },
    subject: { type: String, required: true },
    description: { type: String, required: true },
    priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium' },
    status: { type: String, enum: ['Open', 'In Progress', 'Resolved', 'Closed'], default: 'Open' },
    resolution: { type: String },
    resolvedAt: { type: Date },
    // Optional context — which job the customer is complaining about, or
    // which purchase order the supplier issue relates to. Neither required:
    // plenty of real complaints (e.g. a billing dispute) don't tie to one.
    jobCardId: { type: Schema.Types.ObjectId, ref: 'JobCard' },
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },
  },
  { timestamps: true }
);

export type ComplaintDoc = InferSchemaType<typeof ComplaintSchema> & { _id: mongoose.Types.ObjectId };

export const Complaint = mongoose.models.Complaint || mongoose.model('Complaint', ComplaintSchema);
