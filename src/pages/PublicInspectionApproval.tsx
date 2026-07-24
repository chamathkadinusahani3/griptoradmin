import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2Icon, XCircleIcon, CameraIcon, ThumbsUpIcon, ThumbsDownIcon } from 'lucide-react';
import { Logo } from '../components/layout/Logo';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/StatusBadge';
import { PublicInspection } from '../types/inspection';
import { formatCurrency, formatDate } from '../lib/utils';
import { api, ApiError } from '../lib/api';

export function PublicInspectionApproval() {
  const { token } = useParams();
  const [inspection, setInspection] = useState<PublicInspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .get<{ inspection: PublicInspection }>(`/public/inspections/${token}`)
      .then(({ inspection }) => setInspection(inspection))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  const decide = async (decision: 'approved' | 'rejected') => {
    if (!token) return;
    setDeciding(true);
    try {
      const { inspection } = await api.patch<{ inspection: PublicInspection }>(`/public/inspections/${token}`, { decision });
      setInspection(inspection);
      toast.success(decision === 'approved' ? 'Approved — thank you!' : 'Response recorded');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setDeciding(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-soft-gray p-6 dark:bg-slate-950">
      <div className="w-full max-w-lg rounded-3xl border border-border-soft bg-white p-8 shadow-soft-lg dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 flex justify-center"><Logo /></div>

        {loading &&
        <p className="text-center text-sm text-text-gray dark:text-slate-400">Loading…</p>
        }

        {!loading && (notFound || !inspection) &&
        <div className="text-center">
            <XCircleIcon className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 font-bold text-navy dark:text-slate-100">Link not found</p>
            <p className="mt-1 text-sm text-text-gray dark:text-slate-400">This approval link may have expired or is no longer valid.</p>
          </div>
        }

        {!loading && inspection &&
        <div>
            <div className="text-center">
              <h1 className="text-xl font-extrabold text-navy dark:text-slate-100">Inspection Report</h1>
              <p className="mt-1 text-sm text-text-gray dark:text-slate-400">{inspection.vehicle}{inspection.plate ? ` · ${inspection.plate}` : ''}</p>
              <div className="mt-2 flex justify-center"><StatusBadge status={inspection.result} /></div>
            </div>

            {inspection.media.length > 0 &&
          <div className="mt-5 grid grid-cols-3 gap-2">
                {inspection.media.map((m) =>
            m.type === 'video' ?
            <video key={m.url} src={m.url} controls className="h-24 w-full rounded-xl object-cover" /> :

            <img key={m.url} src={m.url} alt="" className="h-24 w-full rounded-xl object-cover" />

            )}
              </div>
          }

            {inspection.notes &&
          <div className="mt-5 rounded-xl bg-soft-gray p-4 text-sm text-navy dark:bg-slate-800/60 dark:text-slate-200">
                {inspection.notes}
              </div>
          }

            {typeof inspection.additionalCost === 'number' && inspection.additionalCost > 0 &&
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Additional work found</p>
                <p className="mt-1 text-2xl font-extrabold text-amber-800 dark:text-amber-300">{formatCurrency(inspection.additionalCost)}</p>
              </div>
          }

            {inspection.approvalStatus === 'pending' &&
          <div className="mt-6 grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={() => decide('rejected')} loading={deciding} className="justify-center">
                  <ThumbsDownIcon className="h-4 w-4" /> Reject
                </Button>
                <Button onClick={() => decide('approved')} loading={deciding} className="justify-center">
                  <ThumbsUpIcon className="h-4 w-4" /> Approve
                </Button>
              </div>
          }

            {inspection.approvalStatus === 'approved' &&
          <div className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-emerald-50 p-4 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2Icon className="h-5 w-5" /> You approved this on {formatDate(inspection.date)}
              </div>
          }
            {inspection.approvalStatus === 'rejected' &&
          <div className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-red-50 p-4 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                <XCircleIcon className="h-5 w-5" /> You declined the additional work
              </div>
          }
            {inspection.approvalStatus === 'not_required' &&
          <div className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-soft-gray p-4 text-text-gray dark:bg-slate-800/60 dark:text-slate-400">
                <CameraIcon className="h-5 w-5" /> No action needed — this is just a copy of your inspection report.
              </div>
          }
          </div>
        }
      </div>
    </div>);

}
