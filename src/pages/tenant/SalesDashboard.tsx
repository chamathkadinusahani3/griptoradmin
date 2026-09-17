import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { DollarSignIcon, CalendarIcon, WalletIcon, RotateCcwIcon, TrendingUpIcon, TrophyIcon, PackageIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { SalesDashboard as SalesDashboardData } from '../../types/salesDashboard';
import { formatCurrency, formatDate } from '../../lib/utils';
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

export function SalesDashboard() {
  const [range, setRange] = useState<RangeKey>('30');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [data, setData] = useState<SalesDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    setLoading(true);
    const query = range === 'custom' ? `range=custom&from=${customFrom}&to=${customTo}` : `range=${range}`;
    api
      .get<SalesDashboardData>(`/tenant/sales-dashboard?${query}`)
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load the Sales dashboard'))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo]);

  return (
    <div>
      <PageHeader title="Sales Dashboard" description="Today's and monthly sales, outstanding, returns, and gross profit at a glance." />

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
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Today's sales" value={formatCurrency(data.today.combinedRevenue)} icon={CalendarIcon} hint={`${data.today.transactions} transactions`} />
            <StatCard label="This month's sales" value={formatCurrency(data.thisMonth.combinedRevenue)} icon={DollarSignIcon} hint={`${data.thisMonth.transactions} transactions`} />
            <StatCard label="Outstanding" value={formatCurrency(data.outstanding.totalOutstanding)} icon={WalletIcon} hint="unpaid invoices" />
            <StatCard label="Gross profit" value={formatCurrency(data.grossProfit.totalGrossProfit)} icon={TrendingUpIcon} hint={data.grossProfit.overallMarginPct != null ? `${data.grossProfit.overallMarginPct}% margin` : undefined} />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Revenue trend" subtitle="Sales revenue + invoice payments, per day" />
              <div className="h-64 px-2 pb-4 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.dailyTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2A8BD4" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#22C1C7" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatDate(v)} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={(v) => formatDate(v as string)} />
                    <Area type="monotone" dataKey="salesRevenue" name="Sales revenue" stroke="#2164B4" strokeWidth={2.5} fill="url(#salesFill)" />
                    <Area type="monotone" dataKey="invoicePayments" name="Invoice payments" stroke="#8B5CF6" strokeWidth={2} fillOpacity={0.08} fill="#8B5CF6" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <CardHeader title="Returns" subtitle="Customer returns within the selected range" />
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-text-gray dark:text-slate-400"><RotateCcwIcon className="h-4 w-4" /> Total returns</span>
                  <span className="font-bold text-navy dark:text-slate-100">{data.returns.totalReturns}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-gray dark:text-slate-400">Total value</span>
                  <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(data.returns.totalAmount)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border-soft pt-3 text-sm dark:border-slate-800">
                  <span className="font-semibold text-navy dark:text-slate-100">Refunded</span>
                  <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(data.returns.totalRefunded)}</span>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Top products" subtitle="By revenue, in the selected range" />
              {data.topProducts.length === 0 ? (
                <p className="p-5 text-sm text-text-gray dark:text-slate-400">No sales in this range.</p>
              ) : (
                <ul className="divide-y divide-border-soft dark:divide-slate-800">
                  {data.topProducts.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 p-4">
                      <span className="flex items-center gap-2 font-semibold text-navy dark:text-slate-100"><PackageIcon className="h-4 w-4 text-text-gray dark:text-slate-500" /> {p.name}</span>
                      <span className="text-right text-sm">
                        <span className="block font-bold text-navy dark:text-slate-100">{formatCurrency(p.revenue)}</span>
                        <span className="block text-xs text-text-gray dark:text-slate-400">GP {formatCurrency(p.grossProfit)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title="Top customers" subtitle="By attributed revenue, in the selected range" />
              {data.topCustomers.length === 0 ? (
                <p className="p-5 text-sm text-text-gray dark:text-slate-400">No attributed sales in this range.</p>
              ) : (
                <ul className="divide-y divide-border-soft dark:divide-slate-800">
                  {data.topCustomers.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 p-4">
                      <span className="flex items-center gap-2 font-semibold text-navy dark:text-slate-100"><TrophyIcon className="h-4 w-4 text-text-gray dark:text-slate-500" /> {c.name}</span>
                      <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(c.revenue)}</span>
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
