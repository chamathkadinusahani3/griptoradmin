import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Prospect, ProspectDoc } from '../../models/Prospect.js';
import { Followup, FollowupDoc } from '../../models/Followup.js';
import { Complaint, ComplaintDoc } from '../../models/Complaint.js';
import { requireTenantPermission } from '../../auth.js';

// Dealer Credit Control roadmap Module 6, Phase 6.2 — the "CRM" functional
// layer's own dashboard, distinct from TenantDashboard (general) and
// SalesForceDashboard (field ops). Purely an aggregation over existing
// Prospect/Followup/Complaint data — no new models. Scoped to a first cut
// of a handful of stat groups, matching SalesDashboard.tsx's own scope
// (this roadmap's own risk note: don't build an exhaustive analytics suite
// here).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  await connectToDatabase();

  const [prospects, followups, complaints] = await Promise.all([
    Prospect.find({ clientId: session.clientId }).select('status').lean() as Promise<ProspectDoc[]>,
    Followup.find({ clientId: session.clientId, status: 'Pending' })
      .select('subjectName dueDate type')
      .sort({ dueDate: 1 })
      .lean() as Promise<FollowupDoc[]>,
    Complaint.find({ clientId: session.clientId, direction: 'customer', status: { $in: ['Open', 'In Progress'] } })
      .select('complaintNumber subject priority status createdAt')
      .sort({ createdAt: -1 })
      .lean() as Promise<ComplaintDoc[]>,
  ]);

  const funnelByStatus = new Map<string, number>();
  for (const p of prospects) funnelByStatus.set(p.status ?? 'New', (funnelByStatus.get(p.status ?? 'New') ?? 0) + 1);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const overdueFollowups = followups.filter((f) => new Date(f.dueDate) < startOfToday);
  const dueTodayFollowups = followups.filter((f) => new Date(f.dueDate) >= startOfToday && new Date(f.dueDate) < endOfToday);
  const upcomingFollowups = followups.filter((f) => new Date(f.dueDate) >= endOfToday);

  return res.status(200).json({
    prospectFunnel: {
      total: prospects.length,
      new: funnelByStatus.get('New') ?? 0,
      contacted: funnelByStatus.get('Contacted') ?? 0,
      qualified: funnelByStatus.get('Qualified') ?? 0,
      converted: funnelByStatus.get('Converted') ?? 0,
      lost: funnelByStatus.get('Lost') ?? 0,
    },
    followups: {
      overdueCount: overdueFollowups.length,
      dueTodayCount: dueTodayFollowups.length,
      upcomingCount: upcomingFollowups.length,
      overdue: overdueFollowups.slice(0, 10).map((f) => ({ id: f._id.toString(), subjectName: f.subjectName, dueDate: f.dueDate, type: f.type })),
      dueToday: dueTodayFollowups.slice(0, 10).map((f) => ({ id: f._id.toString(), subjectName: f.subjectName, dueDate: f.dueDate, type: f.type })),
    },
    complaints: {
      openCount: complaints.length,
      recent: complaints.slice(0, 10).map((c) => ({
        id: c._id.toString(),
        complaintNumber: c.complaintNumber,
        subject: c.subject,
        priority: c.priority,
        status: c.status,
        createdAt: (c as unknown as { createdAt: Date }).createdAt,
      })),
    },
  });
}
