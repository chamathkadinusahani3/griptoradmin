import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShoppingCartIcon, WalletIcon, TrendingUpIcon, ClockIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { PurchaseReport as PurchaseReportData } from '../../types/purchaseReport';
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

export function PurchaseReport() {
  const [range, setRange] = useState<RangeKey>('30');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [data, setData] = useState<PurchaseReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    setLoading(true);
    const query = range === 'custom' ? `range=custom&from=${customFrom}&to=${customTo}` : `range=${range}`;
    api
      .get<PurchaseReportData>(`/tenant/purchase-report?${query}`)
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load purchase report'))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo]);

  return (
    <div>
      <PageHeader title="Purchase Report" description="What you're buying, from whom, and how much it costs." />

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
            <StatCard label="Orders placed" value={String(data.orders.byStatus.Ordered + data.orders.byStatus['Partially Received'] + data.orders.byStatus.Received)} icon={ShoppingCartIcon} />
            <StatCard label="Total spend" value={formatCurrency(data.orders.totalSpend)} icon={WalletIcon} />
            <StatCard label="Avg order value" value={formatCurrency(data.orders.avgOrderValue)} icon={TrendingUpIcon} />
            <StatCard label="On-time delivery" value={data.orders.onTimeRate === null ? '—' : `${data.orders.onTimeRate}%`} icon={ClockIcon} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Orders by status" />
              <div className="flex flex-wrap gap-2 p-5">
                {Object.entries(data.orders.byStatus).map(([status, count]) => (
                  <Badge key={status} tone={status === 'Received' ? 'green' : status === 'Cancelled' ? 'red' : status === 'Ordered' ? 'blue' : status === 'Partially Received' ? 'amber' : 'gray'}>
                    {status}: {count}
                  </Badge>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title="Top suppliers by spend" />
              {data.topSuppliers.length === 0 ? (
                <div className="p-5"><EmptyState icon={ShoppingCartIcon} title="No purchases yet" description="Spend by supplier will appear here once orders are placed." /></div>
              ) : (
                <ul className="divide-y divide-border-soft dark:divide-slate-800">
                  {data.topSuppliers.map((s) => (
                    <li key={s.name} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-semibold text-navy dark:text-slate-100">{s.name}</p>
                        <p className="text-xs text-text-gray dark:text-slate-400">{s.orderCount} order{s.orderCount === 1 ? '' : 's'}</p>
                      </div>
                      <p className="font-bold text-navy dark:text-slate-100">{formatCurrency(s.spend)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader title="Top purchased parts" />
              {data.topParts.length === 0 ? (
                <div className="p-5"><EmptyState icon={ShoppingCartIcon} title="No purchases yet" description="Frequently ordered parts will appear here." /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[500px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                        <th className="px-5 py-3 font-bold">Part</th>
                        <th className="px-5 py-3 text-right font-bold">Qty ordered</th>
                        <th className="px-5 py-3 text-right font-bold">Spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topParts.map((p) => (
                        <tr key={p.name} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                          <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{p.name}</td>
                          <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{p.qty}</td>
                          <td className="px-5 py-3 text-right font-bold text-navy dark:text-slate-100">{formatCurrency(p.spend)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
