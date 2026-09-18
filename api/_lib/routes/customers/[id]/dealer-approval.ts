import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { DealerProfile, DealerProfileDoc, DEALER_APPROVAL_STATUSES } from '../../../models/DealerProfile.js';
import { requireTenantPermission } from '../../../auth.js';
import { serializeDealerProfile } from '../../../serializers.js';
import { respondToApprovalGate } from '../../../approvalGate.js';

// Customer/Dealer Registration roadmap Phase 4 — the credit-approval
// workflow: New Dealer -> Credit Application -> Documents Verified ->
// Credit Review -> Manager Approval -> Finance Approval -> Activated, with
// Rejected reachable as a side-terminal from any state before Activated.
// respondToApprovalGate() is a strict 2-state (Pending -> Approved|Rejected)
// primitive, not a workflow engine — this route calls it once per adjacent
// pair in SEQUENCE below rather than expecting it to know the whole chain,
// exactly as planned. Gated by the single existing `approvals:respond`
// permission, same as every other approval flow in this app — no new
// Manager-only/Finance-only permission was introduced (confirmed decision).
const SEQUENCE = DEALER_APPROVAL_STATUSES.filter((s) => s !== 'Rejected');

interface RespondBody {
  action?: 'advance' | 'reject';
  rejectionReason?: string;
  requestedCreditLimit?: number;
  recommendedCreditLimit?: number;
  approvedCreditLimit?: number;
  creditTerms?: string;
  reviewDate?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'approvals:respond');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing customer id' });

  await connectToDatabase();

  const profile = (await DealerProfile.findOne({ clientId: session.clientId, customerId: id }).lean()) as DealerProfileDoc | null;
  if (!profile) return res.status(404).json({ error: 'Dealer profile not found' });

  const currentStatus = profile.status;
  if (currentStatus == null) {
    return res.status(400).json({ error: 'This dealer predates the credit-approval workflow and has no approval status to advance' });
  }

  const body = (req.body ?? {}) as RespondBody;
  if (body.action !== 'advance' && body.action !== 'reject') {
    return res.status(400).json({ error: 'action must be "advance" or "reject"' });
  }

  let nextStatus: string;
  if (body.action === 'reject') {
    if (currentStatus === 'Activated' || currentStatus === 'Rejected') {
      return res.status(400).json({ error: `Cannot reject a dealer that is already ${currentStatus}` });
    }
    if (!body.rejectionReason?.trim()) return res.status(400).json({ error: 'rejectionReason is required to reject' });
    nextStatus = 'Rejected';
  } else {
    const idx = SEQUENCE.indexOf(currentStatus as (typeof SEQUENCE)[number]);
    if (idx === -1) return res.status(400).json({ error: `Cannot advance from status "${currentStatus}"` });
    if (idx === SEQUENCE.length - 1) return res.status(400).json({ error: 'This dealer is already Activated' });
    nextStatus = SEQUENCE[idx + 1];
  }

  const updated = await respondToApprovalGate<DealerProfileDoc>(
    DealerProfile,
    { _id: profile._id.toString(), clientId: session.clientId },
    currentStatus,
    nextStatus,
    session.sub,
    body.action === 'reject' ? body.rejectionReason : undefined
  );
  if (!updated) {
    return res.status(409).json({ error: 'This dealer\'s approval status changed concurrently — refresh and try again' });
  }

  // A second, non-atomic update for the workflow's descriptive fields
  // (requested/recommended/approved credit limit, terms, review date) —
  // deliberately separate from the atomic status transition above, since
  // respondToApprovalGate() only ever sets status/approvedBy/approvedAt/
  // rejectionReason. Low risk: this is an infrequent, staff-only admin
  // action, not a money-moving/concurrent-write-heavy path.
  const extra: Record<string, unknown> = {};
  if (body.requestedCreditLimit !== undefined) extra.requestedCreditLimit = body.requestedCreditLimit;
  if (body.recommendedCreditLimit !== undefined) extra.recommendedCreditLimit = body.recommendedCreditLimit;
  if (body.approvedCreditLimit !== undefined) extra.approvedCreditLimit = body.approvedCreditLimit;
  if (body.creditTerms !== undefined) extra.creditTerms = body.creditTerms;
  if (body.reviewDate !== undefined) extra.reviewDate = new Date(body.reviewDate);

  let finalProfile = updated;
  if (Object.keys(extra).length > 0) {
    finalProfile = (await DealerProfile.findOneAndUpdate(
      { _id: profile._id, clientId: session.clientId },
      extra,
      { returnDocument: 'after' }
    ).lean()) as DealerProfileDoc;
  }

  return res.status(200).json({ dealerProfile: serializeDealerProfile(finalProfile) });
}
