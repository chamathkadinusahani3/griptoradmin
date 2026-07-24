import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid } from
'recharts';
import { DollarSignIcon, WalletIcon, ClipboardCheckIcon, TrendingUpIcon, DownloadIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { Select } from '../../components/ui/Input';
import { TenantReports, ReportRange } from '../../types/reports';
import { Branch } from '../../types/branch';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const RANGE_OPTIONS: { key: ReportRange; label: string }[] = [
{ key: '7', label: 'Last 7 days' },
{ key: '30', label: 'Last 30 days' },
{ key: '90', label: 'Last 90 days' },
{ key: '365', label: 'This year' },
{ key: 'custom', label: 'Custom' }];


const COLORS = ['#2164B4', '#1EA4B6', '#22C1C7', '#2A8BD4', '#19356E', '#8B5CF6', '#F59E0B'];

function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function Reports() {
  const [range, setRange] = useState<ReportRange>('30');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [data, setData] = useState<TenantReports | null>(null);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchFilter, setBranchFilter] = useState('');

  useEffect(() => {
    api.get<{ branches: Branch[] }>('/branches').then(({ branches }) => setBranches(branches)).catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    setLoading(true);
    const query =
      (range === 'custom'
        ? `range=custom&from=${customFrom}&to=${customTo}`
        : `range=${range}`) + (branchFilter ? `&branchId=${branchFilter}` : '');
    api
      .get<TenantReports>(`/tenant/reports?${query}`)
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load reports'))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo, branchFilter]);

  return (
    <div>
      <PageHeader title="Reports & Analytics" description="Revenue, job performance, and inventory insights." />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {RANGE_OPTIONS.map((r) =>
        <button
          key={r.key}
          onClick={() => setRange(r.key)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${range === r.key ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>

            {r.label}
          </button>
        )}
        {branches.length > 1 &&
        <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="ml-auto w-44">
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        }
      </div>

      {range === 'custom' &&
      <div className="mb-6 flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-text-gray dark:text-slate-400">
            From
            <input
            type="date"
            value={customFrom}
            max={customTo}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-lg border border-border-soft bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />

          </label>
          <label className="flex items-center gap-1.5 text-text-gray dark:text-slate-400">
            To
            <input
            type="date"
            value={customTo}
            min={customFrom}
            max={todayIso()}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-lg border border-border-soft bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />

          </label>
        </div>}

      {loading || !data ?
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-4"><Skeleton className="h-16 w-full" /></Card>)}
        </div> :

      <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Collected" value={formatCurrency(data.revenue.collected)} icon={DollarSignIcon} hint="this period" />
            <StatCard label="Outstanding" value={formatCurrency(data.revenue.outstanding)} icon={WalletIcon} hint="all unpaid invoices" />
            <StatCard label="Jobs completed" value={`${data.jobs.completed} / ${data.jobs.total}`} icon={ClipboardCheckIcon} />
            <StatCard label="Completion rate" value={`${data.jobs.completionRate}%`} icon={TrendingUpIcon} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Revenue trend" subtitle="Collected per day" />
              <div className="h-64 px-2 pb-4 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.revenue.dailyTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2A8BD4" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#22C1C7" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatDate(v)} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={(v) => formatDate(v as string)} />
                    <Area type="monotone" dataKey="collected" name="Collected" stroke="#2164B4" strokeWidth={2.5} fill="url(#revFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <CardHeader title="Job volume" subtitle="Created per day" />
              <div className="h-64 px-2 pb-4 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.jobs.dailyVolume} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatDate(v)} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip labelFormatter={(v) => formatDate(v as string)} />
                    <Area type="monotone" dataKey="total" name="Total" stroke="#8B5CF6" strokeWidth={2} fillOpacity={0.08} fill="#8B5CF6" />
                    <Area type="monotone" dataKey="completed" name="Completed" stroke="#22C1C7" strokeWidth={2.5} fillOpacity={0.2} fill="#22C1C7" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader
              title="Service performance"
              subtitle="Actual vs. estimated duration"
              action={
              <Button size="sm" variant="ghost" onClick={() => exportCsv('services.csv', ['Service', 'Total', 'Completed', 'Avg minutes', 'Estimated minutes', 'Efficiency %'], data.jobs.byService.map((s) => [s.service, s.total, s.completed, s.avgActualMinutes ?? '', s.estimatedMinutes ?? '', s.efficiencyPct ?? '']))}>

                    <DownloadIcon className="h-3.5 w-3.5" /> CSV
                  </Button>
              } />

              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                      <th className="px-5 py-3 font-bold">Service</th>
                      <th className="px-5 py-3 font-bold">Jobs</th>
                      <th className="px-5 py-3 font-bold">Avg time</th>
                      <th className="px-5 py-3 font-bold">Efficiency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobs.byService.map((s) =>
                  <tr key={s.service} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                        <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{s.service}</td>
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">{s.completed}/{s.total}</td>
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">{s.avgActualMinutes !== undefined ? `${s.avgActualMinutes}m` : '—'}</td>
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">{s.efficiencyPct !== undefined ? `${s.efficiencyPct}%` : '—'}</td>
                      </tr>
                  )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <CardHeader
              title="Technician performance"
              subtitle="Jobs completed this period"
              action={
              <Button size="sm" variant="ghost" onClick={() => exportCsv('technicians.csv', ['Technician', 'Total', 'Completed', 'Avg minutes'], data.jobs.byTechnician.map((t) => [t.technician, t.total, t.completed, t.avgActualMinutes ?? '']))}>

                    <DownloadIcon className="h-3.5 w-3.5" /> CSV
                  </Button>
              } />

              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                      <th className="px-5 py-3 font-bold">Technician</th>
                      <th className="px-5 py-3 font-bold">Jobs</th>
                      <th className="px-5 py-3 font-bold">Avg time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobs.byTechnician.map((t) =>
                  <tr key={t.technician} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                        <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{t.technician}</td>
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">{t.completed}/{t.total}</td>
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">{t.avgActualMinutes !== undefined ? `${t.avgActualMinutes}m` : '—'}</td>
                      </tr>
                  )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader title="Inventory value by category" />
              <div className="flex items-center gap-3 p-5 pt-0">
                <div className="h-40 w-40 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.inventory.byCategory} dataKey="value" nameKey="category" innerRadius={35} outerRadius={65} paddingAngle={3}>
                        {data.inventory.byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-1.5">
                  {data.inventory.byCategory.map((c, i) =>
                <div key={c.category} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-text-gray dark:text-slate-400">
                        <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} /> {c.category}
                      </span>
                      <span className="font-semibold text-navy dark:text-slate-100">{formatCurrency(c.value)}</span>
                    </div>
                )}
                </div>
              </div>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader
              title="Top items by value"
              subtitle={`${data.inventory.totalItems} items · ${data.inventory.lowStockCount} low stock · ${data.inventory.outOfStockCount} out of stock`}
              action={
              <Button size="sm" variant="ghost" onClick={() => exportCsv('inventory.csv', ['Item', 'Category', 'Stock', 'Price', 'Value'], data.inventory.topItemsByValue.map((it) => [it.name, it.category, it.stock, it.price, it.value]))}>

                    <DownloadIcon className="h-3.5 w-3.5" /> CSV
                  </Button>
              } />

              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                      <th className="px-5 py-3 font-bold">Item</th>
                      <th className="px-5 py-3 font-bold">Category</th>
                      <th className="px-5 py-3 font-bold">Stock</th>
                      <th className="px-5 py-3 font-bold">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.inventory.topItemsByValue.map((it) =>
                  <tr key={it.name} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                        <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{it.name}</td>
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">{it.category}</td>
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">{it.stock}</td>
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatCurrency(it.value)}</td>
                      </tr>
                  )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      }
    </div>);

}
