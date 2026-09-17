import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PackageSearchIcon, DownloadIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { SlowMovingProductsReport as SlowMovingProductsReportData } from '../../types/slowMovingProductsReport';
import { formatCurrency, formatDate, exportCsv } from '../../lib/utils';
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

export function SlowMovingProductsReport() {
  const [range, setRange] = useState<RangeKey>('90');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(90));
  const [customTo, setCustomTo] = useState(todayIso());
  const [data, setData] = useState<SlowMovingProductsReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    setLoading(true);
    const rangeQuery = range === 'custom' ? `range=custom&from=${customFrom}&to=${customTo}` : `range=${range}`;
    api
      .get<SlowMovingProductsReportData>(`/tenant/slow-moving-products-report?${rangeQuery}`)
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo]);

  const topRows = data ? data.rows.slice(0, 50) : [];

  return (
    <div>
      <PageHeader title="Slow-Moving Products" description="Parts in stock with the least sales activity in the selected window, slowest first." />

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
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Parts in stock" value={String(data.summary.totalParts)} icon={PackageSearchIcon} />
            <StatCard label="Zero sold in range" value={String(data.summary.zeroInRangeCount)} icon={PackageSearchIcon} />
            <StatCard label="Never sold" value={String(data.summary.neverSoldCount)} icon={PackageSearchIcon} />
            <StatCard label="Stock value at risk" value={formatCurrency(data.summary.totalStockValueAtRisk)} icon={PackageSearchIcon} hint="parts with 0 sold in range" />
          </div>

          <Card>
            <CardHeader
              title="Slowest movers"
              subtitle={`Showing ${topRows.length} of ${data.rows.length}`}
              action={
                <Button size="sm" variant="ghost" onClick={() => exportCsv('slow-moving-products.csv', ['Part', 'Category', 'Stock', 'Qty sold in range', 'Last sold', 'Days since last sale', 'Stock value'], data.rows.map((r) => [r.name, r.category, r.stock, r.qtySoldInRange, r.lastSoldAt ? formatDate(r.lastSoldAt) : 'Never', r.daysSinceLastSale ?? '', r.stockValue]))}>
                  <DownloadIcon className="h-3.5 w-3.5" /> CSV
                </Button>
              }
            />
            {topRows.length === 0 ? (
              <div className="p-5"><EmptyState icon={PackageSearchIcon} title="No parts in stock" description="Add inventory to see slow movers here." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                      <th className="px-5 py-3 font-bold">Part</th>
                      <th className="px-5 py-3 font-bold">Category</th>
                      <th className="px-5 py-3 text-right font-bold">Stock</th>
                      <th className="px-5 py-3 text-right font-bold">Sold in range</th>
                      <th className="px-5 py-3 font-bold">Last sold</th>
                      <th className="px-5 py-3 text-right font-bold">Stock value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRows.map((r) => (
                      <tr key={r.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                        <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{r.name}</td>
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">{r.category}</td>
                        <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{r.stock}</td>
                        <td className="px-5 py-3 text-right">
                          {r.qtySoldInRange === 0 ? <Badge tone="red">0</Badge> : <span className="text-navy dark:text-slate-100">{r.qtySoldInRange}</span>}
                        </td>
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">
                          {r.lastSoldAt ? `${formatDate(r.lastSoldAt)} (${r.daysSinceLastSale}d ago)` : 'Never'}
                        </td>
                        <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{formatCurrency(r.stockValue)}</td>
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
