import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DollarSignIcon, ReceiptIcon, TrendingUpIcon, WalletIcon, DownloadIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { SalesReport as SalesReportData, SalesReportView, SalesReportSummaryRow, SalesReportDetailRow } from '../../types/salesReport';
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

export function SalesReport() {
  const [range, setRange] = useState<RangeKey>('30');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [view, setView] = useState<SalesReportView>('summary');
  const [data, setData] = useState<SalesReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    setLoading(true);
    const rangeQuery = range === 'custom' ? `range=custom&from=${customFrom}&to=${customTo}` : `range=${range}`;
    api
      .get<SalesReportData>(`/tenant/sales-report?${rangeQuery}&view=${view}`)
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo, view]);

  const summaryRows = data && data.view === 'summary' ? (data.rows as SalesReportSummaryRow[]) : [];
  const detailRows = data && data.view === 'detail' ? (data.rows as SalesReportDetailRow[]) : [];

  return (
    <div>
      <PageHeader title="Sales Report" description="Realized sales revenue (POS + fulfilled sales orders) plus invoice payments collected." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
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
        <div className="flex gap-1 rounded-full bg-soft-gray p-1 dark:bg-slate-800">
          {(['summary', 'detail'] as SalesReportView[]).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${view === v ? 'bg-griptor-gradient text-white' : 'text-text-gray dark:text-slate-300'}`}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Sales revenue" value={formatCurrency(data.summary.totalSalesRevenue)} icon={DollarSignIcon} />
            <StatCard label="Transactions" value={String(data.summary.totalTransactions)} icon={ReceiptIcon} />
            <StatCard label="Avg transaction" value={formatCurrency(data.summary.avgTransactionValue)} icon={TrendingUpIcon} />
            <StatCard label="Invoice payments" value={formatCurrency(data.summary.invoicePaymentsCollected)} icon={WalletIcon} />
          </div>

          {view === 'summary' ? (
            <Card>
              <CardHeader
                title="Daily breakdown"
                subtitle={`${summaryRows.length} day${summaryRows.length === 1 ? '' : 's'} with activity`}
                action={
                  <Button size="sm" variant="ghost" onClick={() => exportCsv('sales-summary.csv', ['Date', 'Sales revenue', 'Invoice payments', 'Transactions'], summaryRows.map((r) => [r.date, r.salesRevenue, r.invoicePayments, r.transactions]))}>
                    <DownloadIcon className="h-3.5 w-3.5" /> CSV
                  </Button>
                }
              />
              {summaryRows.length === 0 ? (
                <div className="p-5"><EmptyState icon={DollarSignIcon} title="No sales in this range" description="Try a wider date range." /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                        <th className="px-5 py-3 font-bold">Date</th>
                        <th className="px-5 py-3 text-right font-bold">Sales revenue</th>
                        <th className="px-5 py-3 text-right font-bold">Invoice payments</th>
                        <th className="px-5 py-3 text-right font-bold">Transactions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryRows.map((r) => (
                        <tr key={r.date} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                          <td className="px-5 py-3 text-navy dark:text-slate-100">{formatDate(r.date)}</td>
                          <td className="px-5 py-3 text-right text-navy dark:text-slate-100">{formatCurrency(r.salesRevenue)}</td>
                          <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{formatCurrency(r.invoicePayments)}</td>
                          <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{r.transactions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ) : (
            <Card>
              <CardHeader
                title="Transactions"
                subtitle={`${detailRows.length} transaction${detailRows.length === 1 ? '' : 's'}`}
                action={
                  <Button size="sm" variant="ghost" onClick={() => exportCsv('sales-detail.csv', ['Type', 'Reference', 'Date', 'Amount', 'Method'], detailRows.map((r) => [r.type, r.reference, formatDate(r.date), r.amount, r.method]))}>
                    <DownloadIcon className="h-3.5 w-3.5" /> CSV
                  </Button>
                }
              />
              {detailRows.length === 0 ? (
                <div className="p-5"><EmptyState icon={ReceiptIcon} title="No transactions in this range" description="Try a wider date range." /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                        <th className="px-5 py-3 font-bold">Type</th>
                        <th className="px-5 py-3 font-bold">Reference</th>
                        <th className="px-5 py-3 font-bold">Date</th>
                        <th className="px-5 py-3 font-bold">Method</th>
                        <th className="px-5 py-3 text-right font-bold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailRows.map((r, i) => (
                        <tr key={i} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                          <td className="px-5 py-3 text-text-gray dark:text-slate-400">{r.type}</td>
                          <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{r.reference}</td>
                          <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(r.date)}</td>
                          <td className="px-5 py-3 text-text-gray dark:text-slate-400">{r.method}</td>
                          <td className="px-5 py-3 text-right text-navy dark:text-slate-100">{formatCurrency(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
