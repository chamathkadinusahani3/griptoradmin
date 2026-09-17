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
import { SfPendingDeliveryReport as SfPendingDeliveryReportData } from '../../types/sfPendingDeliveryReport';
import { exportCsv } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

export function SfPendingDeliveryReport() {
  const [data, setData] = useState<SfPendingDeliveryReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<SfPendingDeliveryReportData>('/tenant/sf-pending-delivery-report')
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load report'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Pending Delivery Report" description="Live snapshot of every confirmed order with outstanding items." />

      {loading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard label="Pending deliveries" value={String(data.summary.totalPending)} icon={PackageSearchIcon} />
            <StatCard label="Total volume" value={`${data.summary.totalVolume} cu ft`} icon={PackageSearchIcon} />
            <StatCard label="Unassigned" value={String(data.summary.unassignedCount)} icon={PackageSearchIcon} />
          </div>

          <Card>
            <CardHeader
              title="Pending orders"
              subtitle={`${data.rows.length} orders`}
              action={
                <Button size="sm" variant="ghost" onClick={() => exportCsv('pending-deliveries.csv', ['Order', 'Customer', 'Outstanding items', 'Volume', 'Suggested vehicle', 'Status', 'Route', 'Driver'], data.rows.map((r) => [r.salesOrderNumber, r.customerName, r.outstandingItemCount, r.totalVolume, r.suggestedVehicleType ?? '', r.assignmentStatus, r.routeName ?? '', r.driverName ?? '']))}>
                  <DownloadIcon className="h-3.5 w-3.5" /> CSV
                </Button>
              }
            />
            {data.rows.length === 0 ? (
              <div className="p-5"><EmptyState icon={PackageSearchIcon} title="Nothing pending" description="Every confirmed order has been fully delivered." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                      <th className="px-5 py-3 font-bold">Order</th>
                      <th className="px-5 py-3 font-bold">Customer</th>
                      <th className="px-5 py-3 text-right font-bold">Items</th>
                      <th className="px-5 py-3 text-right font-bold">Volume</th>
                      <th className="px-5 py-3 font-bold">Route / driver</th>
                      <th className="px-5 py-3 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.salesOrderId} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                        <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{r.salesOrderNumber}</td>
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">{r.customerName}</td>
                        <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{r.outstandingItemCount}</td>
                        <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{r.totalVolume > 0 ? `${r.totalVolume} cu ft` : '—'}{r.suggestedVehicleType && <span className="block text-xs text-teal">{r.suggestedVehicleType}</span>}</td>
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">{r.routeName ?? '—'}{r.driverName && <span className="block text-xs">{r.driverName}</span>}</td>
                        <td className="px-5 py-3"><Badge tone={r.assignmentStatus === 'Unassigned' ? 'gray' : 'blue'}>{r.assignmentStatus}</Badge></td>
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
