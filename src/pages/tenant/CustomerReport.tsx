import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { UsersIcon, StarIcon, GiftIcon, AlertTriangleIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { CustomerReport as CustomerReportData } from '../../types/customerReport';
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

export function CustomerReport() {
  const [range, setRange] = useState<RangeKey>('30');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [data, setData] = useState<CustomerReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    setLoading(true);
    const query = range === 'custom' ? `range=custom&from=${customFrom}&to=${customTo}` : `range=${range}`;
    api
      .get<CustomerReportData>(`/tenant/customer-report?${query}`)
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load customer report'))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo]);

  return (
    <div>
      <PageHeader title="Customer Report" description="New customers, feedback, loyalty, and complaints." />

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
            <StatCard label="New customers" value={String(data.newCustomers)} icon={UsersIcon} />
            <StatCard label="Avg rating" value={data.avgRating != null ? `${data.avgRating}★` : '—'} icon={StarIcon} />
            <StatCard label="Points earned" value={String(data.pointsEarned)} icon={GiftIcon} />
            <StatCard label="Complaints" value={String(data.complaintsTotal)} icon={AlertTriangleIcon} />
          </div>

          <Card className="mb-6">
            <CardHeader title="New customers" subtitle="By day" />
            <div className="h-64 p-5 pt-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dailyNewCustomers}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="New customers" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Feedback ratings" subtitle={`${data.feedbackCount} reviews`} />
              <div className="space-y-2 p-5">
                {data.ratingDistribution.slice().reverse().map((r) => (
                  <div key={r.stars} className="flex items-center gap-3 text-sm">
                    <span className="w-10 shrink-0 text-text-gray dark:text-slate-400">{r.stars}★</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-soft-gray dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{ width: `${data.feedbackCount ? (r.count / data.feedbackCount) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right text-text-gray dark:text-slate-400">{r.count}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title="Customer complaints" subtitle="By status" />
              <ul className="divide-y divide-border-soft dark:divide-slate-800">
                {Object.entries(data.complaintsByStatus).map(([status, count]) => (
                  <li key={status} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="text-navy dark:text-slate-100">{status}</span>
                    <span className="text-text-gray dark:text-slate-400">{count}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border-soft px-5 py-3 text-xs text-text-gray dark:border-slate-800 dark:text-slate-400">
                Loyalty points redeemed this period: {data.pointsRedeemed}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
