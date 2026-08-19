import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Timesheet, TimesheetDoc } from '../../models/Timesheet.js';
import { User } from '../../models/User.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeTimesheet } from '../../serializers.js';

interface UpdateTimesheetBody {
  action?: 'approve' | 'reject';
  rejectionReason?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing timesheet id' });

  const body = (req.body ?? {}) as UpdateTimesheetBody;
  if (body.action !== 'approve' && body.action !== 'reject') {
    return res.status(400).json({ error: 'action must be "approve" or "reject"' });
  }

  // Same Manager/Owner-only gate as purchase-requisitions/[id].ts's approve/
  // reject — the broader payroll:manage grant (held by whoever can submit a
  // timesheet) shouldn't also let someone approve their own.
  const session = await requireTenantPermission(req, res, 'approvals:respond');
  if (!session) return;

  await connectToDatabase();

  const existing = (await Timesheet.findOne({ _id: id, clientId: session.clientId }).lean()) as TimesheetDoc | null;
  if (!existing) return res.status(404).json({ error: 'Timesheet not found' });
  if (existing.status !== 'Submitted') {
    return res.status(400).json({ error: 'Only a Submitted timesheet can be approved or rejected' });
  }
  if (body.action === 'reject' && !body.rejectionReason?.trim()) {
    return res.status(400).json({ error: 'A rejection reason is required' });
  }

  const updated = (await Timesheet.findOneAndUpdate(
    { _id: id, clientId: session.clientId, status: 'Submitted' },
    {
      status: body.action === 'approve' ? 'Approved' : 'Rejected',
      reviewedBy: session.sub,
      reviewedAt: new Date(),
      rejectionReason: body.action === 'reject' ? body.rejectionReason!.trim() : undefined,
    },
    { returnDocument: 'after' }
  ).lean()) as TimesheetDoc | null;
  if (!updated) return res.status(400).json({ error: 'This timesheet changed status — refresh and try again' });

  const reviewer = (await User.findById(session.sub).select('name').lean()) as { name: string } | null;
  return res.status(200).json({ timesheet: serializeTimesheet(updated, reviewer?.name) });
}
