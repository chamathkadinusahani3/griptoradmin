import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { TrendingUpIcon, DownloadIcon, InfoIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { GrossProfitReport as GrossProfitReportData, GrossProfitDimension } from '../../types/grossProfitReport';
import { formatCurrency, exportCsv } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

type RangeKey = '30' | '90' | '365' | 'custom';
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: '365', label: 'This year' },
  { key: 'custom', label: 'Custom' },
];
const DIMENSION_OPTIONS: { key: GrossProfitDimension; label: string }[] = [
  { key: 'product', label: 'Product' },
  { key: 'customer', label: 'Customer' },
  { key: 'salesperson', label: 'Salesperson' },
];

function todayIso() { return new Date().toISOString().slice(0, 10); }
function daysAgoIso(days: number) { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); }

export function GrossProfitReport() {
  const [range, setRange] = useState<RangeKey>('30');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [dimension, setDimension] = useState<GrossProfitDimension>('product');
  const [data, setData] = useState<GrossProfitReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    setLoading(true);
    const rangeQuery = range === 'custom' ? `range=custom&from=${customFrom}&to=${customTo}` : `range=${range}`;
    api
      .get<GrossProfitReportData>(`/tenant/gross-profit-report?${rangeQuery}&dimension=${dimension}`)
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo, dimension]);

  const dimensionLabel = DIMENSION_OPTIONS.find((d) => d.key === dimension)?.label ?? 'Product';

  return (
    <div>
      <PageHeader title="Gross Profit Report" description="Revenue minus cost of goods sold, by product, customer, or salesperson." />

      <div className="mb-4 flex flex-wrap gap-2">
        {DIMENSION_OPTIONS.map((d) => (
          <button key={d.key} onClick={() => setDimension(d.key)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${dimension === d.key ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>
            {d.label}
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
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

      {data?.costIsApproximate && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Cost is approximated using each part's current cost, not the cost at the time of the historical sale (per-line cost isn't recorded on a POS/fulfilled sale).</span>
        </div>
      )}

      {loading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Revenue" value={formatCurrency(data.summary.totalRevenue)} icon={TrendingUpIcon} />
            <StatCard label="Cost of goods sold" value={formatCurrency(data.summary.totalCogs)} icon={TrendingUpIcon} />
            <StatCard label="Gross profit" value={formatCurrency(data.summary.totalGrossProfit)} icon={TrendingUpIcon} />
            <StatCard label="Margin" value={data.summary.overallMarginPct != null ? `${data.summary.overallMarginPct}%` : '—'} icon={TrendingUpIcon} />
          </div>

          <Card>
            <CardHeader
              title={`By ${dimensionLabel}`}
              subtitle={`${data.rows.length} row${data.rows.length === 1 ? '' : 's'}`}
              action={
                <Button size="sm" variant="ghost" onClick={() => exportCsv(`gross-profit-${dimension}.csv`, [dimensionLabel, 'Revenue', 'COGS', 'Gross profit', 'Margin %'], data.rows.map((r) => [r.name, r.revenue, r.cogs, r.grossProfit, r.marginPct ?? '']))}>
                  <DownloadIcon className="h-3.5 w-3.5" /> CSV
                </Button>
              }
            />
            {data.rows.length === 0 ? (
              <div className="p-5"><EmptyState icon={TrendingUpIcon} title="No sales in this range" description="Try a wider date range." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                      <th className="px-5 py-3 font-bold">{dimensionLabel}</th>
                      <th className="px-5 py-3 text-right font-bold">Revenue</th>
                      <th className="px-5 py-3 text-right font-bold">COGS</th>
                      <th className="px-5 py-3 text-right font-bold">Gross profit</th>
                      <th className="px-5 py-3 text-right font-bold">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                        <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{r.name}</td>
                        <td className="px-5 py-3 text-right text-navy dark:text-slate-100">{formatCurrency(r.revenue)}</td>
                        <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{formatCurrency(r.cogs)}</td>
                        <td className="px-5 py-3 text-right text-navy dark:text-slate-100">{formatCurrency(r.grossProfit)}</td>
                        <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{r.marginPct != null ? `${r.marginPct}%` : '—'}</td>
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
