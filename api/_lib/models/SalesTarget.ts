import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const TARGET_PERIOD_TYPES = ['Daily', 'Weekly', 'Monthly'] as const;

// `periodType` is a display/grouping label only — the actual window used to
// compute "Actual Sales" is the explicit periodStart/periodEnd range, not
// derived from the type (avoids ambiguous "which day does a week start on"
// logic). Actual sales are never stored here — computed on read by summing
// attributed SalesOrder/CustomerInvoice totals in the range, same
// "derive, don't store" discipline as dealerMetrics.ts/financial-overview.ts.
const SalesTargetSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    salespersonId: { type: Schema.Types.ObjectId, ref: 'Salesperson', required: true },
    periodType: { type: String, enum: TARGET_PERIOD_TYPES, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    targetAmount: { type: Number, required: true },
  },
  { timestamps: true }
);

export type SalesTargetDoc = InferSchemaType<typeof SalesTargetSchema> & { _id: mongoose.Types.ObjectId };

export const SalesTarget = mongoose.models.SalesTarget || mongoose.model('SalesTarget', SalesTargetSchema);
