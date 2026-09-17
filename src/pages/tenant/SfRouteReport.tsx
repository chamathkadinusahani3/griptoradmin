import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RouteIcon, DownloadIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { SfRouteReport as SfRouteReportData } from '../../types/sfRouteReport';
import { exportCsv } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

export function SfRouteReport() {
  const [data, setData] = useState<SfRouteReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<SfRouteReportData>('/tenant/sf-route-report')
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load report'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Delivery Route Report" description="Live snapshot of every route, its deliveries, and pending volume." />

      {loading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard label="Total routes" value={String(data.summary.totalRoutes)} icon={RouteIcon} />
            <StatCard label="Active routes" value={String(data.summary.activeRoutes)} icon={RouteIcon} />
            <StatCard label="No deliveries" value={String(data.summary.routesWithNoDeliveries)} icon={RouteIcon} />
          </div>

          <Card>
            <CardHeader
              title="Routes"
              subtitle={`${data.rows.length} routes`}
              action={
                <Button size="sm" variant="ghost" onClick={() => exportCsv('delivery-routes.csv', ['Code', 'Name', 'Territory', 'Salesperson', 'Driver', 'Status', 'Deliveries', 'Pending volume'], data.rows.map((r) => [r.code, r.name, r.territory ?? '', r.salespersonName ?? '', r.driverName ?? '', r.status, r.deliveryCount, r.pendingVolume]))}>
                  <DownloadIcon className="h-3.5 w-3.5" /> CSV
                </Button>
              }
            />
            {data.rows.length === 0 ? (
              <div className="p-5"><EmptyState icon={RouteIcon} title="No routes yet" description="Add a route to see it here." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                      <th className="px-5 py-3 font-bold">Route</th>
                      <th className="px-5 py-3 font-bold">Territory</th>
                      <th className="px-5 py-3 font-bold">Salesperson / driver</th>
                      <th className="px-5 py-3 font-bold">Status</th>
                      <th className="px-5 py-3 text-right font-bold">Deliveries</th>
                      <th className="px-5 py-3 text-right font-bold">Pending volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.routeId} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                        <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{r.name}<span className="block text-xs font-normal text-text-gray dark:text-slate-500">{r.code}</span></td>
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">{r.territory ?? '—'}</td>
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">{r.salespersonName ?? '—'}{r.driverName && <span className="block text-xs">{r.driverName}</span>}</td>
                        <td className="px-5 py-3"><Badge tone={r.status === 'Active' ? 'green' : 'gray'}>{r.status}</Badge></td>
                        <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{r.deliveryCount}</td>
                        <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{r.pendingVolume > 0 ? `${r.pendingVolume} cu ft` : '—'}</td>
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
