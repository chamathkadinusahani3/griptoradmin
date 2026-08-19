import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SalaryAdvance, SalaryAdvanceDoc } from '../../models/SalaryAdvance.js';
import { User } from '../../models/User.js';
import { requireTenantPermission } from '../../auth.js';
import { postJournalEntry, getAccountIdsByNames, cashOrBankAccountName } from '../../journal.js';
import { serializeSalaryAdvance } from '../../serializers.js';

interface UpdateAdvanceBody {
  action?: 'approve' | 'reject';
  paymentMethod?: 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Other';
  rejectionReason?: string;
}

// Approving pays the advance out immediately (no separate "disburse" step —
// see SalaryAdvance.ts's own comment on why this stays self-contained
// rather than threading into a future PayrollRun deduction).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing advance id' });

  const body = (req.body ?? {}) as UpdateAdvanceBody;
  if (body.action !== 'approve' && body.action !== 'reject') {
    return res.status(400).json({ error: 'action must be "approve" or "reject"' });
  }

  // Same Manager/Owner-only gate as timesheets/[id].ts and purchase-
  // requisitions/[id].ts — approving a cash payout is a stricter action
  // than requesting one.
  const session = await requireTenantPermission(req, res, 'approvals:respond');
  if (!session) return;

  await connectToDatabase();

  const existing = (await SalaryAdvance.findOne({ _id: id, clientId: session.clientId }).lean()) as SalaryAdvanceDoc | null;
  if (!existing) return res.status(404).json({ error: 'Salary advance not found' });
  if (existing.status !== 'Pending') {
    return res.status(400).json({ error: 'Only a Pending advance can be approved or rejected' });
  }
  if (body.action === 'reject' && !body.rejectionReason?.trim()) {
    return res.status(400).json({ error: 'A rejection reason is required' });
  }

  const paymentMethod = body.paymentMethod || 'Bank Transfer';
  const updated = (await SalaryAdvance.findOneAndUpdate(
    { _id: id, clientId: session.clientId, status: 'Pending' },
    {
      status: body.action === 'approve' ? 'Approved' : 'Rejected',
      paymentMethod: body.action === 'approve' ? paymentMethod : undefined,
      approvedBy: session.sub,
      approvedAt: new Date(),
      rejectionReason: body.action === 'reject' ? body.rejectionReason!.trim() : undefined,
    },
    { returnDocument: 'after' }
  ).lean()) as SalaryAdvanceDoc | null;
  if (!updated) return res.status(400).json({ error: 'This advance changed status — refresh and try again' });

  if (body.action === 'approve') {
    // Best-effort, same reasoning as every other non-transactional GL
    // posting in this codebase — a broken journal entry must never block
    // the advance record itself.
    try {
      const accountIds = await getAccountIdsByNames(session.clientId, ['Employee Advances', cashOrBankAccountName(paymentMethod)]);
      const advancesId = accountIds.get('Employee Advances');
      const cashOrBankId = accountIds.get(cashOrBankAccountName(paymentMethod));
      if (advancesId && cashOrBankId) {
        await postJournalEntry({
          clientId: session.clientId,
          description: `Salary advance — ${updated.advanceNumber}`,
          sourceType: 'payroll',
          sourceId: id,
          lines: [{ accountId: advancesId, debit: updated.amount }, { accountId: cashOrBankId, credit: updated.amount }],
        });
      }
    } catch (err) {
      console.error('Journal posting failed for salary advance', id, err);
    }
  }

  const approver = (await User.findById(session.sub).select('name').lean()) as { name: string } | null;
  return res.status(200).json({ advance: serializeSalaryAdvance(updated, approver?.name) });
}
