import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LayoutGridIcon, WrenchIcon, ClockIcon, ClipboardCheckIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { WorkshopReport as WorkshopReportData } from '../../types/workshopReport';
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

export function WorkshopReport() {
  const [range, setRange] = useState<RangeKey>('30');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [data, setData] = useState<WorkshopReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    setLoading(true);
    const query = range === 'custom' ? `range=custom&from=${customFrom}&to=${customTo}` : `range=${range}`;
    api
      .get<WorkshopReportData>(`/tenant/workshop-report?${query}`)
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load workshop report'))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo]);

  return (
    <div>
      <PageHeader title="Workshop Report" description="Bay utilization and technician attendance." />

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
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Bays" value={String(data.bayCount)} icon={LayoutGridIcon} />
            <StatCard label="Bay utilization" value={`${data.bayUtilizationPct}%`} icon={ClockIcon} />
            <StatCard label="Jobs with a bay" value={`${data.jobsWithBayAssigned}/${data.totalJobs}`} icon={ClipboardCheckIcon} />
            <StatCard label="Technician hours" value={`${data.totalHoursWorked}h`} icon={WrenchIcon} />
          </div>

          <Card>
            <CardHeader title="Technician attendance" subtitle="Hours worked and days present" />
            <ul className="divide-y divide-border-soft dark:divide-slate-800">
              {data.technicianAttendance.map((t) => (
                <li key={t.technician} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="text-navy dark:text-slate-100">{t.technician}</span>
                  <span className="text-text-gray dark:text-slate-400">{t.hoursWorked}h over {t.daysWorked} day{t.daysWorked === 1 ? '' : 's'}</span>
                </li>
              ))}
              {data.technicianAttendance.length === 0 && <li className="px-5 py-4 text-sm text-text-gray dark:text-slate-400">No attendance recorded in this period.</li>}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
