import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { CameraIcon, CheckCircle2Icon, ClipboardCheckIcon, DollarSignIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { InspectionReport as InspectionReportData } from '../../types/inspectionReport';
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

export function InspectionReport() {
  const [range, setRange] = useState<RangeKey>('30');
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [data, setData] = useState<InspectionReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    setLoading(true);
    const query = range === 'custom' ? `range=custom&from=${customFrom}&to=${customTo}` : `range=${range}`;
    api
      .get<InspectionReportData>(`/tenant/inspection-report?${query}`)
      .then(setData)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load inspection report'))
      .finally(() => setLoading(false));
  }, [range, customFrom, customTo]);

  return (
    <div>
      <PageHeader title="Inspection Report" description="Digital inspection outcomes and customer approvals." />

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
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total inspections" value={String(data.total)} icon={CameraIcon} />
            <StatCard label="Pass rate" value={`${data.passRate}%`} icon={CheckCircle2Icon} />
            <StatCard label="Approval rate" value={data.approvalRate != null ? `${data.approvalRate}%` : '—'} icon={ClipboardCheckIcon} />
            <StatCard label="Approved extra work" value={formatCurrency(data.approvedAdditionalCost)} icon={DollarSignIcon} />
          </div>

          <Card className="mb-6">
            <CardHeader title="Daily inspection volume" />
            <div className="h-64 p-5 pt-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dailyVolume}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Inspections" fill="#22C1C7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="By result" />
              <div className="flex flex-wrap gap-2 p-5">
                <Badge tone="green">Pass: {data.byResult.Pass}</Badge>
                <Badge tone="amber">Advisory: {data.byResult.Advisory}</Badge>
                <Badge tone="red">Fail: {data.byResult.Fail}</Badge>
              </div>
            </Card>
            <Card>
              <CardHeader title="Customer approval status" />
              <div className="flex flex-wrap gap-2 p-5">
                <Badge tone="amber">Pending: {data.byApproval.pending}</Badge>
                <Badge tone="green">Approved: {data.byApproval.approved}</Badge>
                <Badge tone="red">Rejected: {data.byApproval.rejected}</Badge>
                <Badge tone="gray">Not required: {data.byApproval.not_required}</Badge>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
