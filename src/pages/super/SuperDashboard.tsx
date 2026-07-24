import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid } from
'recharts';
import {
  BuildingIcon,
  DollarSignIcon,
  TimerIcon,
  TrendingDownIcon,
  UserPlusIcon,
  CreditCardIcon,
  LifeBuoyIcon,
  UserMinusIcon } from
'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { Card, CardHeader } from '../../components/ui/Card';
import { CardSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { useTheme } from '../../context/ThemeContext';
import { ActivityType, DashboardSummary } from '../../types/dashboard';
import { relativeTime, formatCurrency } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const activityIcon: Record<ActivityType, {icon: typeof UserPlusIcon;tone: string;}> = {
  signup: { icon: UserPlusIcon, tone: 'bg-blue-50 text-royal dark:bg-blue-500/15 dark:text-blue-300' },
  payment: { icon: CreditCardIcon, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300' },
  ticket: { icon: LifeBuoyIcon, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300' },
  churn: { icon: UserMinusIcon, tone: 'bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-300' }
};

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border-soft bg-white px-3 py-2 text-sm shadow-soft dark:border-slate-700 dark:bg-slate-800">
      <p className="font-bold text-navy dark:text-slate-100">{label}</p>
      {payload.map((p: any) =>
      <p key={p.name} className="text-text-gray dark:text-slate-300">
          {p.name}: <span className="font-semibold">{typeof p.value === 'number' && p.value > 100 ? '$' : ''}{p.value.toLocaleString()}</span>
        </p>
      )}
    </div>);

}

export function SuperDashboard() {
  const { theme } = useTheme();
  const grid = theme === 'dark' ? '#1e293b' : '#EEF4F8';
  const axis = theme === 'dark' ? '#64748b' : '#94a3b8';
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<DashboardSummary>('/dashboard/summary')
      .then(setSummary)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Platform overview across all GRIPTOR garage accounts." />


      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading || !summary ?
        Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />) :

        <>
            <StatCard label="Total Clients" value={String(summary.stats.totalClients)} icon={BuildingIcon} />
            <StatCard label="MRR" value={formatCurrency(summary.stats.mrr)} icon={DollarSignIcon} />
            <StatCard label="Active Trials" value={String(summary.stats.activeTrials)} icon={TimerIcon} />
            <StatCard label="Churn Rate" value={`${summary.stats.churnRatePct}%`} icon={TrendingDownIcon} hint="suspended / total clients" />
          </>
        }
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Committed MRR by signup cohort" subtitle="Cumulative MRR from clients signed up through each month" />
          <div className="h-72 px-2 pb-4 pt-4">
            {loading || !summary ?
            <Skeleton className="mx-4 h-full" /> :

            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={summary.mrrSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2A8BD4" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#22C1C7" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                  <XAxis dataKey="month" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="mrr" name="MRR" stroke="#2164B4" strokeWidth={2.5} fill="url(#mrrFill)" />
                </AreaChart>
              </ResponsiveContainer>
            }
          </div>
        </Card>

        <Card>
          <CardHeader title="New signups" subtitle="Per month" />
          <div className="h-72 px-2 pb-4 pt-4">
            {loading || !summary ?
            <Skeleton className="mx-4 h-full" /> :

            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.signupSeries} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="signupBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1EA4B6" />
                      <stop offset="100%" stopColor="#22C1C7" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                  <XAxis dataKey="month" stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke={axis} fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.1)' }} />
                  <Bar dataKey="signups" name="Signups" fill="url(#signupBar)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            }
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent activity" subtitle="Latest events across the platform" />
        <ul className="px-5 pb-3 pt-4">
          {loading || !summary ?
          Array.from({ length: 5 }).map((_, i) =>
          <li key={i} className="flex items-center gap-3 py-3">
                  <Skeleton className="h-9 w-9 rounded-xl" />
                  <Skeleton className="h-4 flex-1" />
                </li>
          ) :
          summary.recentActivity.length === 0 ?
          <li className="py-6 text-center text-sm text-text-gray dark:text-slate-400">No activity yet.</li> :
          summary.recentActivity.map((a) => {
            const { icon: Icon, tone } = activityIcon[a.type];
            return (
              <li key={a.id} className="flex items-center gap-3 border-b border-border-soft py-3 last:border-0 dark:border-slate-800">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <p className="flex-1 text-sm text-navy dark:text-slate-200">{a.text}</p>
                    <span className="shrink-0 text-xs text-text-gray dark:text-slate-500">{relativeTime(a.time)}</span>
                  </li>);

          })}
        </ul>
      </Card>
    </div>);

}
