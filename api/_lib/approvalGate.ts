import mongoose from 'mongoose';

// Shared "respond to a pending approval" concurrency guard. Before this
// extraction, the exact same shape (fetch -> check status==='Pending' ->
// atomically transition using the pending-status filter itself as an
// optimistic-concurrency guard -> null means someone else already
// responded first) was independently written 3x: PurchaseRequisition,
// SalaryAdvance, LeaveRequest — each with its own field names
// (reviewedBy/reviewedAt vs approvedBy/approvedAt). Those three are left
// untouched (working code, different field names, not worth the churn);
// every NEW gate from here on (Sales Order Approve, and later Debit Note
// Confirm) standardizes on `approvedBy`/`approvedAt`/`rejectionReason` and
// calls this helper instead of re-deriving the shape.
export async function respondToApprovalGate<T>(
  model: mongoose.Model<any>,
  filter: { _id: string; clientId: string },
  pendingStatus: string,
  resultStatus: string,
  respondedBy: string,
  rejectionReason?: string,
  // Optional — Sales Module Phase 10's Customer Debit Note confirm needs
  // this same optimistic-concurrency transition to happen inside the SAME
  // transaction as its CustomerInvoice total/balance update (so a confirmed
  // note always corresponds to a billed invoice, never one without the
  // other). Every existing caller omits this and behaves exactly as before.
  dbSession?: mongoose.ClientSession
): Promise<T | null> {
  const update: Record<string, unknown> = { status: resultStatus, approvedBy: respondedBy, approvedAt: new Date() };
  if (rejectionReason !== undefined) update.rejectionReason = rejectionReason;
  return model
    .findOneAndUpdate({ ...filter, status: pendingStatus }, update, { returnDocument: 'after', session: dbSession })
    .lean() as Promise<T | null>;
}
