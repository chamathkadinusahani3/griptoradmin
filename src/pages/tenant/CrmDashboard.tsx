import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { UsersIcon, PhoneCallIcon, AlertTriangleIcon, ClipboardListIcon, MessageSquareWarningIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { CrmDashboardSummary } from '../../types/crmDashboard';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const PRIORITY_TONE: Record<string, 'red' | 'amber' | 'gray'> = { Urgent: 'red', High: 'red', Medium: 'amber', Low: 'gray' };

// Dealer Credit Control roadmap Module 6, Phase 6.2 — the CRM functional
// layer's own dashboard, distinct from TenantDashboard and
// SalesForceDashboard. A live snapshot (no date range) since prospect
// funnel/follow-ups-due/open-complaints are all "right now" states, not
// period-bound sales figures.
export function CrmDashboard() {
  const [data, setData] = useState<CrmDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<CrmDashboardSummary>('/tenant/crm-dashboard')
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load the CRM dashboard'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="CRM Dashboard" description="Prospect pipeline, follow-ups due, and open customer complaints at a glance." />

      {loading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total prospects" value={String(data.prospectFunnel.total)} icon={UsersIcon} hint={`${data.prospectFunnel.converted} converted`} />
            <StatCard label="Overdue follow-ups" value={String(data.followups.overdueCount)} icon={AlertTriangleIcon} />
            <StatCard label="Due today" value={String(data.followups.dueTodayCount)} icon={PhoneCallIcon} />
            <StatCard label="Open complaints" value={String(data.complaints.openCount)} icon={MessageSquareWarningIcon} />
          </div>

          <div className="mb-6">
            <Card>
              <CardHeader title="Prospect funnel" subtitle="Every prospect, by current stage" />
              <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-5">
                {([
                  ['New', data.prospectFunnel.new],
                  ['Contacted', data.prospectFunnel.contacted],
                  ['Qualified', data.prospectFunnel.qualified],
                  ['Converted', data.prospectFunnel.converted],
                  ['Lost', data.prospectFunnel.lost],
                ] as const).map(([label, count]) => (
                  <div key={label} className="text-center">
                    <p className="text-2xl font-extrabold text-navy dark:text-slate-100">{count}</p>
                    <p className="text-xs text-text-gray dark:text-slate-400">{label}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Follow-ups due" subtitle="Overdue and due today" />
              {data.followups.overdue.length === 0 && data.followups.dueToday.length === 0 ? (
                <p className="p-5 text-sm text-text-gray dark:text-slate-400">Nothing due — you're all caught up.</p>
              ) : (
                <ul className="divide-y divide-border-soft dark:divide-slate-800">
                  {[...data.followups.overdue, ...data.followups.dueToday].map((f) => {
                    const overdue = data.followups.overdue.some((o) => o.id === f.id);
                    return (
                      <li key={f.id} className="flex items-center justify-between gap-3 p-4">
                        <span className="flex items-center gap-2 font-semibold text-navy dark:text-slate-100">
                          <ClipboardListIcon className="h-4 w-4 text-text-gray dark:text-slate-500" /> {f.subjectName}
                        </span>
                        <span className="text-right text-xs">
                          {overdue && <Badge tone="red">Overdue</Badge>}
                          <span className="ml-2 text-text-gray dark:text-slate-400">{formatDate(f.dueDate)} · {f.type}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title="Open complaints" subtitle="Awaiting resolution" />
              {data.complaints.recent.length === 0 ? (
                <p className="p-5 text-sm text-text-gray dark:text-slate-400">No open complaints.</p>
              ) : (
                <ul className="divide-y divide-border-soft dark:divide-slate-800">
                  {data.complaints.recent.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-navy dark:text-slate-100">{c.complaintNumber}</p>
                        <p className="truncate text-xs text-text-gray dark:text-slate-400">{c.subject}</p>
                      </div>
                      <Badge tone={PRIORITY_TONE[c.priority] ?? 'gray'}>{c.priority}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
