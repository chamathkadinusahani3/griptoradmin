import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const COLLECTION_TASK_STATUSES = ['Pending', 'Contacted', 'Promise to Pay', 'Collected', 'Failed'] as const;

// Sales Module Phase 3 — a genuinely new concept, confirmed to have nothing
// adjacent to extend: CollectionRecord.ts is append-only and represents
// money ALREADY received (its own comment: "A field collection recorded by
// a salesperson"), never a follow-up task. This is the other half — a
// worklist item assigned to a staff member to chase an overdue customer,
// tracked through to either an actual collection or a failure, independent
// of whether/how the money eventually gets recorded (that still happens
// through the existing Receipt/CustomerInvoice payment/CollectionRecord
// flows — this document never itself moves money or posts GL).
const CollectionTaskSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    // Snapshotted at creation — same "record what was true when created"
    // convention as Followup.subjectName.
    customerName: { type: String, required: true },
    // The customer's total outstanding balance (from
    // getCustomerInvoicesAndTotals, same source ar-aging.ts uses) at the
    // moment this task was raised — informational only, never recomputed
    // live, so a task's own record of "why this was raised" can't drift
    // just because other invoices/payments happen later.
    outstandingAmountAtCreation: { type: Number, required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: COLLECTION_TASK_STATUSES, default: 'Pending' },
    contactDate: { type: Date },
    promiseDate: { type: Date },
    promiseAmount: { type: Number },
    collectedAmount: { type: Number },
    failReason: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

export type CollectionTaskDoc = InferSchemaType<typeof CollectionTaskSchema> & { _id: mongoose.Types.ObjectId };

export const CollectionTask = mongoose.models.CollectionTask || mongoose.model('CollectionTask', CollectionTaskSchema);
