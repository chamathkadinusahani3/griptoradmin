import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { BoxesIcon, DollarSignIcon, AlertTriangleIcon, PackageIcon, PrinterIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { InventoryReport as InventoryReportData } from '../../types/inventoryReport';
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

export function InventoryReport() {
  const [range, setRange] = useState<RangeKey>('30');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [data, setData] = useState<InventoryReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    setLoading(true);
    const query = range === 'custom' ? `range=custom&from=${customFrom}&to=${customTo}` : `range=${range}`;
    api
      .get<InventoryReportData>(`/tenant/inventory-report?${query}`)
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load inventory report'))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo]);

  return (
    <div>
      <PageHeader
        title="Inventory Report"
        description="Stock health and sales performance."
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Inventory value" value={formatCurrency(data.totalValue)} icon={BoxesIcon} />
            <StatCard label="Sales revenue" value={formatCurrency(data.salesRevenue)} icon={DollarSignIcon} />
            <StatCard label="Low stock" value={String(data.lowStockCount)} icon={AlertTriangleIcon} />
            <StatCard label="Out of stock" value={String(data.outOfStockCount)} icon={PackageIcon} />
          </div>

          <Card className="mb-6">
            <CardHeader title="Sales trend" />
            <div className="h-64 p-5 pt-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.dailySales}>
                  <defs>
                    <linearGradient id="invSalesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1EA4B6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#1EA4B6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v)} width={80} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Area type="monotone" dataKey="revenue" name="Sales" stroke="#1EA4B6" fill="url(#invSalesGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Top items by value" />
              <ul className="divide-y divide-border-soft dark:divide-slate-800">
                {data.topItemsByValue.map((p) => (
                  <li key={p.name} className="flex items-center justify-between px-5 py-3 text-sm">
                    <div>
                      <p className="text-navy dark:text-slate-100">{p.name}</p>
                      <p className="text-xs text-text-gray dark:text-slate-400">{p.category} · {p.stock} in stock</p>
                    </div>
                    <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(p.value)}</span>
                  </li>
                ))}
                {data.topItemsByValue.length === 0 && <li className="px-5 py-4 text-sm text-text-gray dark:text-slate-400">No inventory yet.</li>}
              </ul>
            </Card>

            <Card>
              <CardHeader title="Top selling items" subtitle="This period" />
              <ul className="divide-y divide-border-soft dark:divide-slate-800">
                {data.topSellingItems.map((p) => (
                  <li key={p.name} className="flex items-center justify-between px-5 py-3 text-sm">
                    <div>
                      <p className="text-navy dark:text-slate-100">{p.name}</p>
                      <p className="text-xs text-text-gray dark:text-slate-400">{p.qty} sold</p>
                    </div>
                    <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(p.revenue)}</span>
                  </li>
                ))}
                {data.topSellingItems.length === 0 && <li className="px-5 py-4 text-sm text-text-gray dark:text-slate-400">No sales in this period.</li>}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
