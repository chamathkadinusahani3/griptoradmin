import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BarChart3Icon, DownloadIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { SalesByReport as SalesByReportData, SalesByDimension } from '../../types/salesByReport';
import { formatCurrency, exportCsv } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

type RangeKey = '30' | '90' | '365' | 'custom';
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: '365', label: 'This year' },
  { key: 'custom', label: 'Custom' },
];
const DIMENSION_OPTIONS: { key: SalesByDimension; label: string }[] = [
  { key: 'customer', label: 'Customer' },
  { key: 'branch', label: 'Branch' },
  { key: 'salesperson', label: 'Salesperson' },
  { key: 'paymentMethod', label: 'Payment Method' },
];

function todayIso() { return new Date().toISOString().slice(0, 10); }
function daysAgoIso(days: number) { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); }

export function SalesByReport() {
  const [range, setRange] = useState<RangeKey>('30');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [dimension, setDimension] = useState<SalesByDimension>('customer');
  const [data, setData] = useState<SalesByReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    setLoading(true);
    const rangeQuery = range === 'custom' ? `range=custom&from=${customFrom}&to=${customTo}` : `range=${range}`;
    api
      .get<SalesByReportData>(`/tenant/sales-by-report?${rangeQuery}&dimension=${dimension}`)
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo, dimension]);

  const dimensionLabel = DIMENSION_OPTIONS.find((d) => d.key === dimension)?.label ?? 'Customer';

  return (
    <div>
      <PageHeader title="Sales By Report" description="Attributed sales revenue grouped by customer, branch, salesperson, or payment method." />

      <div className="mb-4 flex flex-wrap gap-2">
        {DIMENSION_OPTIONS.map((d) => (
          <button key={d.key} onClick={() => setDimension(d.key)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${dimension === d.key ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>
            {d.label}
          </button>
        ))}
      </div>
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
          <div className="grid grid-cols-2 gap-4">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4">
            <StatCard label="Total revenue" value={formatCurrency(data.summary.totalRevenue)} icon={BarChart3Icon} />
            <StatCard label={`${dimensionLabel} groups`} value={String(data.summary.groupCount)} icon={BarChart3Icon} />
          </div>

          <Card>
            <CardHeader
              title={`By ${dimensionLabel}`}
              subtitle={`${data.rows.length} row${data.rows.length === 1 ? '' : 's'}`}
              action={
                <Button size="sm" variant="ghost" onClick={() => exportCsv(`sales-by-${dimension}.csv`, [dimensionLabel, 'Revenue', 'Documents'], data.rows.map((r) => [r.name, r.revenue, r.docCount]))}>
                  <DownloadIcon className="h-3.5 w-3.5" /> CSV
                </Button>
              }
            />
            {data.rows.length === 0 ? (
              <div className="p-5"><EmptyState icon={BarChart3Icon} title="No sales in this range" description="Try a wider date range." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                      <th className="px-5 py-3 font-bold">{dimensionLabel}</th>
                      <th className="px-5 py-3 text-right font-bold">Revenue</th>
                      <th className="px-5 py-3 text-right font-bold">Documents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                        <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{r.name}</td>
                        <td className="px-5 py-3 text-right text-navy dark:text-slate-100">{formatCurrency(r.revenue)}</td>
                        <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{r.docCount}</td>
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
