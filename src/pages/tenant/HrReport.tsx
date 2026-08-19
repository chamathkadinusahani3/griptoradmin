import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { UsersIcon, BanknoteIcon, CalendarClockIcon, BriefcaseIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { HrReport as HrReportData } from '../../types/hrReport';
import { formatCurrency } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

type RangeKey = '30' | '90' | '365' | 'custom';
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: '365', label: 'This year' },
  { key: 'custom', label: 'Custom' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function HrReport() {
  const [range, setRange] = useState<RangeKey>('30');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [data, setData] = useState<HrReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    setLoading(true);
    const query = range === 'custom' ? `range=custom&from=${customFrom}&to=${customTo}` : `range=${range}`;
    api
      .get<HrReportData>(`/tenant/hr-report?${query}`)
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load HR report'))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo]);

  return (
    <div>
      <PageHeader title="HR Report" description="Headcount, leave, payroll cost, and recruitment." />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {RANGE_OPTIONS.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${range === r.key ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}
          >
            {r.label}
          </button>
        ))}
        {range === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-lg border border-border-soft bg-white px-2.5 py-1.5 text-xs text-navy dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
            <span className="text-xs text-text-gray dark:text-slate-400">to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-lg border border-border-soft bg-white px-2.5 py-1.5 text-xs text-navy dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
          </div>
        )}
      </div>

      {loading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Headcount" value={String(data.headcount)} icon={UsersIcon} />
            <StatCard label="Payroll cost" value={formatCurrency(data.payrollCost)} icon={BanknoteIcon} />
            <StatCard label="Approved leave days" value={String(data.leave.approvedDays)} icon={CalendarClockIcon} />
            <StatCard label="Open positions" value={String(data.openOpenings)} icon={BriefcaseIcon} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Leave requests" subtitle="By status" />
              <div className="flex flex-wrap gap-2 p-5">
                {Object.entries(data.leave.byStatus).map(([status, count]) => (
                  <Badge key={status} tone={status === 'Approved' ? 'green' : status === 'Rejected' ? 'red' : status === 'Pending' ? 'amber' : 'gray'}>
                    {status}: {count}
                  </Badge>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title="Recruitment pipeline" subtitle="By stage" />
              <div className="flex flex-wrap gap-2 p-5">
                {Object.entries(data.recruitment.byStatus).map(([status, count]) => (
                  <Badge key={status} tone={status === 'Hired' ? 'green' : status === 'Rejected' ? 'red' : status === 'Offered' ? 'blue' : 'gray'}>
                    {status}: {count}
                  </Badge>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
