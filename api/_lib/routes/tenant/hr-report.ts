import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Employee } from '../../models/Employee.js';
import { LeaveRequest, LeaveRequestDoc } from '../../models/LeaveRequest.js';
import { JobOpening } from '../../models/JobOpening.js';
import { Candidate, CandidateDoc } from '../../models/Candidate.js';
import { PayrollRun, PayrollRunDoc } from '../../models/PayrollRun.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  const { from, to } = resolveReportRange(req);
  await connectToDatabase();

  const [headcount, leaveRequests, openOpenings, candidates, payrollRuns] = await Promise.all([
    Employee.countDocuments({ clientId: session.clientId }),
    LeaveRequest.find({ clientId: session.clientId, createdAt: { $gte: from, $lte: to } }).lean() as Promise<LeaveRequestDoc[]>,
    JobOpening.countDocuments({ clientId: session.clientId, status: 'Open' }),
    Candidate.find({ clientId: session.clientId, createdAt: { $gte: from, $lte: to } }).lean() as Promise<CandidateDoc[]>,
    PayrollRun.find({ clientId: session.clientId, status: { $ne: 'Draft' }, periodEnd: { $gte: from, $lte: to } }).lean() as Promise<
      PayrollRunDoc[]
    >,
  ]);

  const leaveByStatus = { Pending: 0, Approved: 0, Rejected: 0, Cancelled: 0 };
  let approvedLeaveDays = 0;
  for (const lr of leaveRequests) {
    if (lr.status in leaveByStatus) leaveByStatus[lr.status as keyof typeof leaveByStatus] += 1;
    if (lr.status === 'Approved') {
      approvedLeaveDays += Math.round((new Date(lr.endDate).getTime() - new Date(lr.startDate).getTime()) / DAY_MS) + 1;
    }
  }

  const candidatesByStatus = { Applied: 0, Interviewing: 0, Offered: 0, Hired: 0, Rejected: 0 };
  for (const c of candidates) candidatesByStatus[c.status as keyof typeof candidatesByStatus] += 1;

  const payrollCost = payrollRuns.reduce((sum, r) => sum + r.totalAmount, 0);

  return res.status(200).json({
    range: { from, to },
    headcount,
    payrollCost: Math.round(payrollCost * 100) / 100,
    openOpenings,
    leave: {
      total: leaveRequests.length,
      byStatus: leaveByStatus,
      approvedDays: approvedLeaveDays,
    },
    recruitment: {
      total: candidates.length,
      byStatus: candidatesByStatus,
    },
  });
}
