import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { TruckIcon, WalletIcon, AlertTriangleIcon, UsersIcon, PrinterIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { SupplierReport as SupplierReportData } from '../../types/supplierReport';
import { formatCurrency, formatDate } from '../../lib/utils';
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

export function SupplierReport() {
  const [range, setRange] = useState<RangeKey>('30');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [data, setData] = useState<SupplierReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    setLoading(true);
    const query = range === 'custom' ? `range=custom&from=${customFrom}&to=${customTo}` : `range=${range}`;
    api
      .get<SupplierReportData>(`/tenant/supplier-report?${query}`)
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load supplier report'))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo]);

  return (
    <div>
      <PageHeader
        title="Supplier Report"
        description="Spend and standing per supplier, ranked by how much you buy from them."
        action={<Button variant="secondary" className="print:hidden" onClick={() => window.print()}><PrinterIcon className="h-4 w-4" /> Print</Button>} />

      <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard label="Suppliers" value={String(data.summary.totalSuppliers)} icon={UsersIcon} />
            <StatCard label="Spend in range" value={formatCurrency(data.summary.totalSpendInRange)} icon={WalletIcon} />
            <StatCard label="Outstanding (all time)" value={formatCurrency(data.summary.totalOutstanding)} icon={AlertTriangleIcon} />
          </div>

          <Card>
            {data.suppliers.length === 0 ? (
              <div className="p-5"><EmptyState icon={TruckIcon} title="No suppliers yet" description="Add a supplier to start tracking spend and standing." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                      <th className="px-5 py-3 font-bold">Supplier</th>
                      <th className="px-5 py-3 text-right font-bold">Spend in range</th>
                      <th className="px-5 py-3 text-right font-bold">Orders</th>
                      <th className="px-5 py-3 text-right font-bold">Outstanding</th>
                      <th className="px-5 py-3 text-right font-bold">On-time</th>
                      <th className="px-5 py-3 text-right font-bold">Last order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.suppliers.map((s) => (
                      <tr key={s.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                        <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{s.name}</td>
                        <td className="px-5 py-3 text-right text-navy dark:text-slate-100">{formatCurrency(s.spendInRange)}</td>
                        <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{s.orderCountInRange}</td>
                        <td className={`px-5 py-3 text-right font-semibold ${s.outstanding > 0 ? 'text-amber-500' : 'text-navy dark:text-slate-100'}`}>{formatCurrency(s.outstanding)}</td>
                        <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{s.onTime === null ? '—' : `${s.onTime}%`}</td>
                        <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{s.lastOrder ? formatDate(s.lastOrder) : 'Never'}</td>
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
