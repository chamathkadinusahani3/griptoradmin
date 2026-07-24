import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend } from
'recharts';
import { DollarSignIcon, TrendingUpIcon, AlertTriangleIcon, RefreshCwIcon, ReceiptIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { Invoice } from '../../types/invoice';
import { BillingSummary } from '../../types/pricingTier';

const COLORS = ['#94a3b8', '#2A8BD4', '#8b5cf6'];

export function Billing() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<{ invoices: Invoice[] }>('/invoices'),
      api.get<BillingSummary>('/billing/summary'),
    ])
      .then(([invoicesRes, summaryRes]) => {
        setInvoices(invoicesRes.invoices);
        setSummary(summaryRes);
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load billing data'))
      .finally(() => setLoading(false));
  }, []);

  const failed = invoices.filter((i) => i.status === 'Failed');

  const retry = async (id: string) => {
    const previous = invoices;
    setInvoices((prev) => prev.map((i) => i.id === id ? { ...i, status: 'Pending' } : i));
    try {
      await api.patch(`/invoices/${id}`, { status: 'Pending' });
      toast.success(`Retrying payment for ${id}…`);
    } catch (err) {
      setInvoices(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to retry payment');
    }
  };

  return (
    <div>
      <PageHeader title="Billing" description="Invoices, payments, and revenue breakdown." />

      {loading || !summary ?
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div> :

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="MRR" value={formatCurrency(summary.totalMrr)} icon={DollarSignIcon} />
          <StatCard label="ARR" value={formatCurrency(summary.totalMrr * 12, { compact: true })} icon={TrendingUpIcon} hint="annualized" />
          <StatCard label="Failed payments" value={String(summary.failedInvoiceCount)} icon={AlertTriangleIcon} deltaDirection="down" hint={summary.failedInvoiceCount > 0 ? 'needs action' : undefined} />
          <StatCard label="Collected (this month)" value={formatCurrency(summary.collectedThisMonth)} icon={DollarSignIcon} />
        </div>
      }

      {failed.length > 0 &&
      <Card className="mt-6 border-red-200 bg-red-50/50 dark:border-red-500/30 dark:bg-red-500/5">
          <div className="flex items-start gap-3 p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300">
              <AlertTriangleIcon className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <h3 className="font-bold text-navy dark:text-slate-100">Failed payments need attention</h3>
              <p className="text-sm text-text-gray dark:text-slate-400">
                {failed.length} invoice(s) failed to collect. Retry or contact the client.
              </p>
              <div className="mt-3 space-y-2">
                {failed.map((inv) =>
              <div key={inv.id} className="flex items-center justify-between rounded-xl border border-red-200 bg-white px-4 py-2.5 dark:border-red-500/30 dark:bg-slate-900">
                    <div>
                      <span className="font-bold text-navy dark:text-slate-100">{inv.client}</span>
                      <span className="ml-2 text-sm text-text-gray dark:text-slate-400">{inv.id} · {formatCurrency(inv.amount)}</span>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => retry(inv.id)}>
                      <RefreshCwIcon className="h-3.5 w-3.5" /> Retry
                    </Button>
                  </div>
              )}
              </div>
            </div>
          </div>
        </Card>
      }

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Invoices" subtitle="Recent billing activity" />
          {invoices.length === 0 ?
          <EmptyState icon={ReceiptIcon} title="No invoices yet" description="Invoices will appear here once billing is connected to a payment processor." /> :

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Invoice</th>
                  <th className="px-5 py-3 font-bold">Client</th>
                  <th className="px-5 py-3 font-bold">Plan</th>
                  <th className="px-5 py-3 font-bold">Date</th>
                  <th className="px-5 py-3 text-right font-bold">Amount</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) =>
                <tr key={inv.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">{inv.id}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-300">{inv.client}</td>
                    <td className="px-5 py-3"><Badge tone={inv.plan === 'Enterprise' ? 'purple' : inv.plan === 'Professional' ? 'teal' : 'gray'}>{inv.plan}</Badge></td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(inv.date)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-navy dark:text-slate-100">{formatCurrency(inv.amount)}</td>
                    <td className="px-5 py-3"><StatusBadge status={inv.status} /></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          }
        </Card>

        <Card>
          <CardHeader title="MRR by plan" subtitle="Revenue split" />
          {!summary || summary.mrrByPlan.length === 0 ?
          <div className="p-5 text-sm text-text-gray dark:text-slate-400">No clients yet.</div> :

          <>
            <div className="h-56 px-2 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={summary.mrrByPlan} dataKey="mrr" nameKey="plan" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {summary.mrrByPlan.map((_, i) =>
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    )}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 px-5 pb-5">
              {summary.mrrByPlan.map((p, i) =>
              <div key={p.plan} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-text-gray dark:text-slate-300">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} /> {p.plan}
                  </span>
                  <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(p.mrr)}</span>
                </div>
              )}
            </div>
          </>
          }
        </Card>
      </div>
    </div>);

}
