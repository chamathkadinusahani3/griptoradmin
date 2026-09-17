import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { TargetIcon, DownloadIcon, CheckCircle2Icon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { SfTargetReport as SfTargetReportData } from '../../types/sfTargetReport';
import { formatCurrency, formatDate, exportCsv } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

type RangeKey = '30' | '90' | '365' | 'custom';
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: '365', label: 'This year' },
  { key: 'custom', label: 'Custom' },
];

function todayIso() { return new Date().toISOString().slice(0, 10); }
function daysAgoIso(days: number) { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); }

export function SfTargetReport() {
  const [range, setRange] = useState<RangeKey>('30');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [data, setData] = useState<SfTargetReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    setLoading(true);
    const query = range === 'custom' ? `range=custom&from=${customFrom}&to=${customTo}` : `range=${range}`;
    api
      .get<SfTargetReportData>(`/tenant/sf-target-report?${query}`)
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo]);

  return (
    <div>
      <PageHeader title="Target vs Actual Report" description="Every sales target overlapping the selected range, with its own actual-sales computation." />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {RANGE_OPTIONS.map((r) => (
          <button key={r.key} onClick={() => setRange(r.key)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${range === r.key ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Targets" value={String(data.summary.targetCount)} icon={TargetIcon} hint={`${data.summary.metCount} met`} />
            <StatCard label="Total target" value={formatCurrency(data.summary.totalTarget)} icon={TargetIcon} />
            <StatCard label="Total actual" value={formatCurrency(data.summary.totalActual)} icon={TargetIcon} />
            <StatCard label="Overall achievement" value={data.summary.overallAchievementPct != null ? `${data.summary.overallAchievementPct}%` : '—'} icon={CheckCircle2Icon} />
          </div>

          <Card>
            <CardHeader
              title="Targets"
              subtitle={`${data.rows.length} in range`}
              action={
                <Button size="sm" variant="ghost" onClick={() => exportCsv('target-vs-actual.csv', ['Salesperson', 'Period', 'Start', 'End', 'Target', 'Actual', 'Achievement %'], data.rows.map((r) => [r.salespersonName, r.periodType, formatDate(r.periodStart), formatDate(r.periodEnd), r.targetAmount, r.actualAmount, r.achievementPct ?? '']))}>
                  <DownloadIcon className="h-3.5 w-3.5" /> CSV
                </Button>
              }
            />
            {data.rows.length === 0 ? (
              <div className="p-5"><EmptyState icon={TargetIcon} title="No targets in this range" description="Set a sales target to see it here." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                      <th className="px-5 py-3 font-bold">Salesperson</th>
                      <th className="px-5 py-3 font-bold">Period</th>
                      <th className="px-5 py-3 text-right font-bold">Target</th>
                      <th className="px-5 py-3 text-right font-bold">Actual</th>
                      <th className="px-5 py-3 text-right font-bold">Achievement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.targetId} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                        <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{r.salespersonName}</td>
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">{r.periodType}<span className="block text-xs">{formatDate(r.periodStart)} – {formatDate(r.periodEnd)}</span></td>
                        <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{formatCurrency(r.targetAmount)}</td>
                        <td className="px-5 py-3 text-right text-navy dark:text-slate-100">{formatCurrency(r.actualAmount)}</td>
                        <td className="px-5 py-3 text-right text-navy dark:text-slate-100">{r.achievementPct != null ? `${r.achievementPct}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
