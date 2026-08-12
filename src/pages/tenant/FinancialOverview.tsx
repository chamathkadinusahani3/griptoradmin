import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { TrendingUpIcon, TrendingDownIcon, WalletIcon, PercentIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { FinancialOverview as FinancialOverviewData } from '../../types/financialOverview';
import { formatCurrency } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

type RangeKey = '30' | '90' | '365' | 'custom';
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: '365', label: 'This year' },
  { key: 'custom', label: 'Custom' },
];

const COLORS = ['#2164B4', '#1EA4B6', '#22C1C7', '#2A8BD4', '#19356E', '#8B5CF6', '#F59E0B'];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function FinancialOverview() {
  const [range, setRange] = useState<RangeKey>('30');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [data, setData] = useState<FinancialOverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    setLoading(true);
    const query = range === 'custom' ? `range=custom&from=${customFrom}&to=${customTo}` : `range=${range}`;
    api
      .get<FinancialOverviewData>(`/tenant/financial-overview?${query}`)
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load financial overview'))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo]);

  return (
    <div>
      <PageHeader title="Financial Overview" description="Revenue, expenses, and net profit across every part of the business." />

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
            <StatCard label="Revenue" value={formatCurrency(data.revenue.total)} icon={TrendingUpIcon} />
            <StatCard label="Expenses" value={formatCurrency(data.expenses.total)} icon={TrendingDownIcon} />
            <StatCard label="Net profit" value={formatCurrency(data.netProfit)} icon={WalletIcon} />
            <StatCard label="Margin" value={data.marginPct != null ? `${data.marginPct}%` : '—'} icon={PercentIcon} />
          </div>

          <Card className="mb-6">
            <CardHeader title="Revenue vs expenses" subtitle="By month" />
            <div className="h-72 p-5 pt-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.monthlyTrend}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1EA4B6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#1EA4B6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v)} width={80} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#1EA4B6" fill="url(#revGrad)" />
                  <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#F59E0B" fill="url(#expGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Revenue breakdown" />
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-gray dark:text-slate-400">POS sales</span>
                  <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(data.revenue.sales)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-gray dark:text-slate-400">Invoice payments</span>
                  <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(data.revenue.invoicePayments)}</span>
                </div>
                {data.revenue.customerRefunds > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-gray dark:text-slate-400">Customer refunds</span>
                    <span className="font-bold text-red-500">−{formatCurrency(data.revenue.customerRefunds)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border-soft pt-3 text-sm dark:border-slate-800">
                  <span className="font-semibold text-navy dark:text-slate-100">Total</span>
                  <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(data.revenue.total)}</span>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Expense breakdown" />
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-gray dark:text-slate-400">Operating expenses</span>
                  <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(data.expenses.operatingExpenses)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-gray dark:text-slate-400">Supplier payments</span>
                  <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(data.expenses.supplierPayments)}</span>
                </div>
                {data.expenses.supplierCredits > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-gray dark:text-slate-400">Supplier credits</span>
                    <span className="font-bold text-emerald-500">−{formatCurrency(data.expenses.supplierCredits)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-gray dark:text-slate-400">Payroll</span>
                  <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(data.expenses.payroll)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border-soft pt-3 text-sm dark:border-slate-800">
                  <span className="font-semibold text-navy dark:text-slate-100">Total</span>
                  <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(data.expenses.total)}</span>
                </div>
              </div>
            </Card>
          </div>

          {data.expenseByCategory.length > 0 && (
            <Card className="mt-6">
              <CardHeader title="Operating expenses by category" />
              <div className="grid grid-cols-1 gap-4 p-5 pt-0 sm:grid-cols-2">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.expenseByCategory} dataKey="amount" nameKey="category" innerRadius={55} outerRadius={85} paddingAngle={2}>
                        {data.expenseByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 self-center">
                  {data.expenseByCategory.map((c, i) => (
                    <div key={c.category} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-text-gray dark:text-slate-400">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        {c.category}
                      </span>
                      <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(c.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
