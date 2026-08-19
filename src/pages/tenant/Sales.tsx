import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ScanBarcodeIcon, DollarSignIcon, ReceiptIcon, TrendingUpIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { Sale } from '../../types/sale';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const PERIOD_FILTERS: ('All' | 'Today' | 'This month')[] = ['All', 'Today', 'This month'];

function isToday(d: Date, now: Date): boolean {
  return d.toDateString() === now.toDateString();
}
function isThisMonth(d: Date, now: Date): boolean {
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export function Sales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'All' | 'Today' | 'This month'>('This month');

  useEffect(() => {
    api
      .get<{ sales: Sale[] }>('/sales')
      .then(({ sales }) => setSales(sales))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load sales'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (period === 'All') return sales;
    const now = new Date();
    return sales.filter((s) => {
      const d = new Date(s.date);
      return period === 'Today' ? isToday(d, now) : isThisMonth(d, now);
    });
  }, [sales, period]);

  const totalRevenue = filtered.reduce((sum, s) => sum + s.total, 0);
  const avgSale = filtered.length ? totalRevenue / filtered.length : 0;

  return (
    <div>
      <PageHeader title="Sales" description="Point-of-sale transaction history." />

      <div className="mb-4 flex flex-wrap gap-2">
        {PERIOD_FILTERS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${period === p ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Revenue" value={formatCurrency(totalRevenue)} icon={DollarSignIcon} />
        <StatCard label="Transactions" value={String(filtered.length)} icon={ReceiptIcon} />
        <StatCard label="Average sale" value={formatCurrency(avgSale)} icon={TrendingUpIcon} />
      </div>

      {loading ? (
        <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={ScanBarcodeIcon} title="No sales" description="Sales made at checkout (Inventory & POS) will show up here." /></Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Date</th>
                  <th className="px-5 py-3 font-bold">Items</th>
                  <th className="px-5 py-3 text-right font-bold">Subtotal</th>
                  <th className="px-5 py-3 text-right font-bold">Tax</th>
                  <th className="px-5 py-3 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(s.date)}</td>
                    <td className="px-5 py-3 text-navy dark:text-slate-100">
                      {s.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}
                    </td>
                    <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{formatCurrency(s.subtotal)}</td>
                    <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{formatCurrency(s.tax)}</td>
                    <td className="px-5 py-3 text-right font-bold text-navy dark:text-slate-100">{formatCurrency(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
