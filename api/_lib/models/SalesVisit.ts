import mongoose, { Schema, InferSchemaType } from 'mongoose';

export const SALES_VISIT_STATUSES = ['Pending', 'In Progress', 'Completed', 'Cancelled', 'Rescheduled'] as const;

// A scheduled field visit by a salesperson to a customer/shop. Mirrors
// Followup's shape (clientId/status/notes pattern) but with the fuller
// status enum the spec calls for. GPS fields are placeholders here —
// SF-Phase 5 populates them for real on checkin/checkout; SF-Phase 4 only
// transitions status. `assignmentId` links back to the SalespersonAssignment
// this visit came from where one exists, but isn't required — ad-hoc visits
// (no standing assignment) are allowed too.
const SalesVisitSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    salespersonId: { type: Schema.Types.ObjectId, ref: 'Salesperson', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: 'SalespersonAssignment' },
    visitDate: { type: Date, required: true },
    purpose: { type: String },
    notes: { type: String },
    status: { type: String, enum: SALES_VISIT_STATUSES, default: 'Pending' },
    checkInAt: { type: Date },
    checkInLat: { type: Number },
    checkInLng: { type: Number },
    checkOutAt: { type: Date },
    checkOutLat: { type: Number },
    checkOutLng: { type: Number },
    durationMinutes: { type: Number },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    rescheduledFrom: { type: Date },
    // Cron-scan dedup flag only (SF-Phase 13's daily "overdue visit" alert)
    // — never exposed to the frontend, same as Part.lowStockAlertActive.
    // "Overdue" itself stays fully derived in the UI (SalesVisits.tsx's
    // existing Overdue tab); this field only prevents re-alerting on a visit
    // that was already flagged.
    overdueAlertActive: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type SalesVisitDoc = InferSchemaType<typeof SalesVisitSchema> & { _id: mongoose.Types.ObjectId };

export const SalesVisit = mongoose.models.SalesVisit || mongoose.model('SalesVisit', SalesVisitSchema);
