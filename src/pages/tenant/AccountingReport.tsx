import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileTextIcon, ReceiptIcon, AlertTriangleIcon, PercentIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { AccountingReport as AccountingReportData } from '../../types/accountingReport';
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

export function AccountingReport() {
  const [range, setRange] = useState<RangeKey>('30');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [data, setData] = useState<AccountingReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    setLoading(true);
    const query = range === 'custom' ? `range=custom&from=${customFrom}&to=${customTo}` : `range=${range}`;
    api
      .get<AccountingReportData>(`/tenant/accounting-report?${query}`)
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load accounting report'))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo]);

  return (
    <div>
      <PageHeader title="Accounting Report" description="Quotation conversion and invoice collection." />

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
            <StatCard label="Quotations sent" value={String(data.quotations.total)} icon={FileTextIcon} />
            <StatCard label="Quote → invoice" value={`${data.quotations.conversionRate}%`} icon={PercentIcon} />
            <StatCard label="Invoiced" value={formatCurrency(data.invoices.totalInvoiced)} icon={ReceiptIcon} />
            <StatCard label="Overdue" value={formatCurrency(data.invoices.overdueAmount)} icon={AlertTriangleIcon} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Quotations by status" />
              <div className="flex flex-wrap gap-2 p-5">
                {Object.entries(data.quotations.byStatus).map(([status, count]) => (
                  <Badge key={status} tone={status === 'Invoiced' ? 'green' : status === 'Rejected' ? 'red' : status === 'Approved' ? 'blue' : 'gray'}>
                    {status}: {count}
                  </Badge>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title="Invoices by payment status" subtitle={`Collection rate: ${data.invoices.collectionRate}%`} />
              <div className="flex flex-wrap gap-2 p-5">
                {Object.entries(data.invoices.byPaymentStatus).map(([status, count]) => (
                  <Badge key={status} tone={status === 'Paid' ? 'green' : status === 'Partial' ? 'amber' : 'gray'}>
                    {status}: {count}
                  </Badge>
                ))}
              </div>
              <div className="border-t border-border-soft px-5 py-3 text-xs text-text-gray dark:border-slate-800 dark:text-slate-400">
                Collected {formatCurrency(data.invoices.totalCollected)} of {formatCurrency(data.invoices.totalInvoiced)}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
