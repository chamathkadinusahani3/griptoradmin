import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CarIcon, DownloadIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { SfVehicleReport as SfVehicleReportData, SfVehicleReportRow } from '../../types/sfVehicleReport';
import { exportCsv } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

type RangeKey = '30' | '90' | '365' | 'custom';
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: '365', label: 'This year' },
  { key: 'custom', label: 'Custom' },
];

const STATUS_TONE: Record<SfVehicleReportRow['status'], 'green' | 'gray' | 'amber'> = {
  Active: 'green',
  Inactive: 'gray',
  'In Maintenance': 'amber',
};

function todayIso() { return new Date().toISOString().slice(0, 10); }
function daysAgoIso(days: number) { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); }

export function SfVehicleReport() {
  const [range, setRange] = useState<RangeKey>('30');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [data, setData] = useState<SfVehicleReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    setLoading(true);
    const query = range === 'custom' ? `range=custom&from=${customFrom}&to=${customTo}` : `range=${range}`;
    api
      .get<SfVehicleReportData>(`/tenant/sf-vehicle-report?${query}`)
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo]);

  return (
    <div>
      <PageHeader title="Vehicle Utilization Report" description="Deliveries handled per fleet vehicle in the selected range." />

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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard label="Total vehicles" value={String(data.summary.totalVehicles)} icon={CarIcon} />
            <StatCard label="Active" value={String(data.summary.activeVehicles)} icon={CarIcon} />
            <StatCard label="Avg deliveries / vehicle" value={String(data.summary.avgDeliveriesPerVehicle)} icon={CarIcon} />
          </div>

          <Card>
            <CardHeader
              title="Vehicles"
              subtitle={`${data.rows.length} vehicles`}
              action={
                <Button size="sm" variant="ghost" onClick={() => exportCsv('vehicle-utilization.csv', ['Vehicle', 'Type', 'Driver', 'Status', 'Fuel efficiency', 'Deliveries assigned', 'Deliveries completed'], data.rows.map((r) => [r.vehicleNumber, r.vehicleType, r.driverName ?? '', r.status, r.fuelEfficiency, r.deliveriesAssigned, r.deliveriesCompleted]))}>
                  <DownloadIcon className="h-3.5 w-3.5" /> CSV
                </Button>
              }
            />
            {data.rows.length === 0 ? (
              <div className="p-5"><EmptyState icon={CarIcon} title="No vehicles yet" description="Add a fleet vehicle to see it here." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                      <th className="px-5 py-3 font-bold">Vehicle</th>
                      <th className="px-5 py-3 font-bold">Driver</th>
                      <th className="px-5 py-3 font-bold">Status</th>
                      <th className="px-5 py-3 text-right font-bold">Fuel eff.</th>
                      <th className="px-5 py-3 text-right font-bold">Assigned</th>
                      <th className="px-5 py-3 text-right font-bold">Delivered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.vehicleId} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                        <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{r.vehicleNumber}<span className="block text-xs font-normal text-text-gray dark:text-slate-500">{r.vehicleType}</span></td>
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">{r.driverName ?? '—'}</td>
                        <td className="px-5 py-3"><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge></td>
                        <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{r.fuelEfficiency > 0 ? `${r.fuelEfficiency} km/l` : '—'}</td>
                        <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{r.deliveriesAssigned}</td>
                        <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{r.deliveriesCompleted}</td>
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
