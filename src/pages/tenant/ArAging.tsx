import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ClockIcon, WalletIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ArAgingReport, AgingBucket } from '../../types/aging';
import { formatCurrency } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const BUCKET_TONE: Record<AgingBucket, 'gray' | 'blue' | 'amber' | 'red'> = {
  Current: 'gray',
  '1-30': 'blue',
  '31-60': 'amber',
  '61-90': 'amber',
  '90+': 'red',
};

export function ArAging() {
  const [data, setData] = useState<ArAgingReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<ArAgingReport>('/tenant/ar-aging')
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load AR aging report'))
      .finally(() => setLoading(false));
  }, []);

  const maxBucketAmount = data ? Math.max(...data.byBucket.map((b) => b.amount), 1) : 1;

  return (
    <div>
      <PageHeader title="Accounts Receivable Aging" description="Outstanding customer invoice balances, grouped by how overdue they are." />

      {loading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard label="Total outstanding" value={formatCurrency(data.totalOutstanding)} icon={WalletIcon} />
            <StatCard label="90+ days overdue" value={formatCurrency(data.byBucket.find((b) => b.bucket === '90+')?.amount ?? 0)} icon={ClockIcon} />
          </div>

          <Card className="mb-6">
            <div className="space-y-3 p-5">
              {data.byBucket.map((b) => (
                <div key={b.bucket} className="flex items-center gap-3">
                  <Badge tone={BUCKET_TONE[b.bucket]} className="w-16 shrink-0 justify-center">{b.bucket}</Badge>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-soft-gray dark:bg-slate-800">
                    <div className="h-full rounded-full bg-griptor-gradient" style={{ width: `${(b.amount / maxBucketAmount) * 100}%` }} />
                  </div>
                  <p className="w-28 shrink-0 text-right text-sm font-bold text-navy dark:text-slate-100">{formatCurrency(b.amount)}</p>
                  <p className="w-16 shrink-0 text-right text-xs text-text-gray dark:text-slate-400">{b.count} inv.</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            {data.customers.length === 0 ? (
              <div className="p-5"><EmptyState icon={WalletIcon} title="Nothing outstanding" description="Every customer invoice is fully paid." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                      <th className="px-5 py-3 font-bold">Customer</th>
                      <th className="px-5 py-3 font-bold">Oldest bucket</th>
                      <th className="px-5 py-3 text-right font-bold">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.customers.map((c) => (
                      <tr key={c.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                        <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{c.name}</td>
                        <td className="px-5 py-3"><Badge tone={BUCKET_TONE[c.oldestBucket]}>{c.oldestBucket}</Badge></td>
                        <td className="px-5 py-3 text-right font-bold text-navy dark:text-slate-100">{formatCurrency(c.outstanding)}</td>
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
