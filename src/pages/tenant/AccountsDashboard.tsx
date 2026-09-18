import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { WalletIcon, LandmarkIcon, FileCheckIcon, HandCoinsIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { DueDateCalendar, DueDateCalendarItem } from '../../components/ui/DueDateCalendar';
import { AccountsDashboardSummary, AccountsDashboardAging } from '../../types/accountsDashboard';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const BUCKET_TONE: Record<string, 'gray' | 'blue' | 'amber' | 'red'> = {
  Current: 'gray',
  '1-30': 'blue',
  '31-60': 'amber',
  '61-90': 'amber',
  '90+': 'red',
};

function AgingMiniChart({ aging }: { aging: AccountsDashboardAging }) {
  const max = Math.max(...aging.byBucket.map((b) => b.amount), 1);
  return (
    <div className="space-y-2 p-5">
      {aging.byBucket.map((b) => (
        <div key={b.bucket} className="flex items-center gap-3">
          <Badge tone={BUCKET_TONE[b.bucket]}>{b.bucket}</Badge>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-soft-gray dark:bg-slate-800">
            <div className="h-full rounded-full bg-teal" style={{ width: `${(b.amount / max) * 100}%` }} />
          </div>
          <span className="w-24 shrink-0 text-right text-xs font-semibold text-navy dark:text-slate-100">{formatCurrency(b.amount)}</span>
        </div>
      ))}
    </div>
  );
}

// Dealer Credit Control roadmap Module 6, Phase 6.3 — the "Accounts"
// functional layer's own dashboard: day-to-day AR-operations visibility,
// distinct from FinancialOverview.tsx's CFO-level P&L summary. Embeds
// Module 5's DueDateCalendar, scoped 'all' for a non-Salesperson-linked
// user (see due-dates.ts's own comment).
export function AccountsDashboard() {
  const [data, setData] = useState<AccountsDashboardSummary | null>(null);
  const [dueDates, setDueDates] = useState<DueDateCalendarItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AccountsDashboardSummary>('/tenant/accounts-dashboard')
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load the Accounts dashboard'))
      .finally(() => setLoading(false));
    api
      .get<{ dueDates: DueDateCalendarItem[] }>('/customer-invoices/due-dates')
      .then(({ dueDates }) => setDueDates(dueDates))
      .catch(() => setDueDates([]));
  }, []);

  return (
    <div>
      <PageHeader title="Accounts Dashboard" description="Receivables, payables, cheques pending clearance, and today's collections at a glance." />

      {loading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Receivable" value={formatCurrency(data.arAging.total)} icon={WalletIcon} />
            <StatCard label="Payable" value={formatCurrency(data.apAging.total)} icon={LandmarkIcon} />
            <StatCard label="Cheques pending" value={formatCurrency(data.cheques.pendingAmount)} icon={FileCheckIcon} hint={`${data.cheques.pendingCount} cheque${data.cheques.pendingCount === 1 ? '' : 's'}`} />
            <StatCard label="Collected today" value={formatCurrency(data.collections.todayTotal)} icon={HandCoinsIcon} hint={`${data.collections.todayCount} collection${data.collections.todayCount === 1 ? '' : 's'}`} />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Receivable aging" subtitle="Outstanding customer invoices" action={<Link to="/app/erp/ar-aging" className="text-xs font-semibold text-royal hover:underline dark:text-blue-300">Full report</Link>} />
              <AgingMiniChart aging={data.arAging} />
            </Card>
            <Card>
              <CardHeader title="Payable aging" subtitle="Outstanding purchase orders" action={<Link to="/app/erp/ap-aging" className="text-xs font-semibold text-royal hover:underline dark:text-blue-300">Full report</Link>} />
              <AgingMiniChart aging={data.apAging} />
            </Card>
          </div>

          {dueDates.length > 0 &&
            <Card className="mb-6">
              <CardHeader title="Invoice due dates" subtitle="Every dealer's upcoming credit-period due dates" />
              <div className="p-5">
                <DueDateCalendar items={dueDates} />
              </div>
            </Card>
          }

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Cheques pending clearance" subtitle="By PD (post-dated) date" action={<Link to="/app/erp/cheques" className="text-xs font-semibold text-royal hover:underline dark:text-blue-300">All cheques</Link>} />
              {data.cheques.upcoming.length === 0 ? (
                <p className="p-5 text-sm text-text-gray dark:text-slate-400">No cheques pending clearance.</p>
              ) : (
                <ul className="divide-y divide-border-soft dark:divide-slate-800">
                  {data.cheques.upcoming.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-navy dark:text-slate-100">{c.chequeNumber}</p>
                        <p className="truncate text-xs text-text-gray dark:text-slate-400">
                          {c.party ?? 'Unknown'} · {c.direction === 'incoming' ? 'Incoming' : 'Outgoing'} · PD {c.dueDate ? formatDate(c.dueDate) : '—'}
                        </p>
                      </div>
                      <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(c.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title="Recent collections" subtitle="Latest field collections recorded" />
              {data.collections.recent.length === 0 ? (
                <p className="p-5 text-sm text-text-gray dark:text-slate-400">No collections recorded yet.</p>
              ) : (
                <ul className="divide-y divide-border-soft dark:divide-slate-800">
                  {data.collections.recent.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-navy dark:text-slate-100">{c.customerName ?? 'Unknown customer'}</p>
                        <p className="text-xs text-text-gray dark:text-slate-400">{c.method} · {formatDate(c.date)}</p>
                      </div>
                      <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(c.amount)}</span>
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
