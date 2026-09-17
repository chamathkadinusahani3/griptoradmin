import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { UsersIcon, CalendarCheckIcon, TargetIcon, HandCoinsIcon, PackageSearchIcon, FuelIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { SfDashboardSummary } from '../../types/sfDashboard';
import { formatCurrency } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

type RangeKey = '30' | '90' | '365' | 'custom';
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: '365', label: 'This year' },
  { key: 'custom', label: 'Custom' },
];

const STATUS_COLORS: Record<string, string> = {
  Pending: '#F59E0B',
  'In Progress': '#2A8BD4',
  Completed: '#22C1C7',
  Cancelled: '#EF4444',
  Rescheduled: '#8B5CF6',
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function SalesForceDashboard() {
  const [range, setRange] = useState<RangeKey>('30');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [data, setData] = useState<SfDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    setLoading(true);
    const query = range === 'custom' ? `range=custom&from=${customFrom}&to=${customTo}` : `range=${range}`;
    api
      .get<SfDashboardSummary>(`/tenant/sf-dashboard?${query}`)
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load the Sales Force dashboard'))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo]);

  const visitBreakdown = data
    ? (['Pending', 'In Progress', 'Completed', 'Cancelled', 'Rescheduled'] as const)
        .map((status) => ({ status, count: data.visits[status] }))
        .filter((s) => s.count > 0)
    : [];

  return (
    <div>
      <PageHeader title="Sales Force Dashboard" description="Salespersons, visits, targets, collections, and deliveries at a glance." />

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
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-border-soft bg-white px-2.5 py-1.5 text-xs text-navy dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <span className="text-xs text-text-gray dark:text-slate-400">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-border-soft bg-white px-2.5 py-1.5 text-xs text-navy dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        )}
      </div>

      {loading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Active salespersons" value={String(data.salespersons.active)} icon={UsersIcon} hint={`${data.salespersons.total} total`} />
            <StatCard label="Visits in range" value={String(data.visits.total)} icon={CalendarCheckIcon} hint={`${data.visits.Completed} completed`} />
            <StatCard label="Target achievement" value={data.targets.achievementPct != null ? `${data.targets.achievementPct}%` : '—'} icon={TargetIcon} hint={`${data.targets.targetCount} targets`} />
            <StatCard label="Today's collections" value={formatCurrency(data.collections.today)} icon={HandCoinsIcon} hint={`Cash ${formatCurrency(data.collections.cash)}`} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Visit status breakdown" subtitle="Scheduled visits within the selected range" />
              {visitBreakdown.length === 0 ? (
                <p className="p-5 text-sm text-text-gray dark:text-slate-400">No visits scheduled in this range.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 p-5 pt-0 sm:grid-cols-2">
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={visitBreakdown} dataKey="count" nameKey="status" innerRadius={50} outerRadius={80} paddingAngle={2}>
                          {visitBreakdown.map((s) => <Cell key={s.status} fill={STATUS_COLORS[s.status]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 self-center">
                    {visitBreakdown.map((s) => (
                      <div key={s.status} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-text-gray dark:text-slate-400">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[s.status] }} />
                          {s.status}
                        </span>
                        <span className="font-bold text-navy dark:text-slate-100">{s.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title="Sales targets" subtitle="Attributed sales vs. target for periods overlapping the selected range" />
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-gray dark:text-slate-400">Total target</span>
                  <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(data.targets.totalTarget)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-gray dark:text-slate-400">Total actual</span>
                  <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(data.targets.totalActual)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border-soft pt-3 text-sm dark:border-slate-800">
                  <span className="font-semibold text-navy dark:text-slate-100">Achievement</span>
                  <span className="font-bold text-navy dark:text-slate-100">{data.targets.achievementPct != null ? `${data.targets.achievementPct}%` : '—'}</span>
                </div>
              </div>
            </Card>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Deliveries" subtitle="Live pending-delivery snapshot + completed within the selected range" />
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-text-gray dark:text-slate-400"><PackageSearchIcon className="h-4 w-4" /> Pending</span>
                  <span className="font-bold text-navy dark:text-slate-100">{data.deliveries.pending}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-gray dark:text-slate-400">Completed (in range)</span>
                  <span className="font-bold text-navy dark:text-slate-100">{data.deliveries.completed}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border-soft pt-3 text-sm dark:border-slate-800">
                  <span className="font-semibold text-navy dark:text-slate-100">Total pending load</span>
                  <span className="font-bold text-navy dark:text-slate-100">{data.deliveries.totalLoad} cu ft</span>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Estimated trip cost" subtitle="Field-visit travel, in the selected range" />
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-text-gray dark:text-slate-400"><FuelIcon className="h-4 w-4" /> Estimated fuel cost</span>
                  <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(data.trips.estimatedFuelCost)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-gray dark:text-slate-400">Total distance traveled</span>
                  <span className="font-bold text-navy dark:text-slate-100">{data.trips.totalDistanceKm} km</span>
                </div>
                <div className="flex items-center justify-between border-t border-border-soft pt-3 text-sm dark:border-slate-800">
                  <span className="font-semibold text-navy dark:text-slate-100">Visits with a fuel estimate</span>
                  <span className="font-bold text-navy dark:text-slate-100">{data.trips.visitsWithFuelEstimate}</span>
                </div>
                {data.trips.visitsWithFuelEstimate === 0 && (
                  <p className="text-xs text-text-gray dark:text-slate-500">
                    Configure a fuel price (Settings) and vehicle fuel efficiency (Fleet Vehicles) to see cost estimates here.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
