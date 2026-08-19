import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileTextIcon, DownloadIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { Payslip } from '../../types/payslip';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { downloadPayslipPdf } from '../../lib/pdf';

export function Payslips() {
  const { user } = useAuth();
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ payslips: Payslip[] }>('/payslips')
      .then(({ payslips }) => setPayslips(payslips))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load payslips'))
      .finally(() => setLoading(false));
  }, []);

  const download = (slip: Payslip) => {
    downloadPayslipPdf({
      garageName: user?.garageName,
      technicianName: slip.subjectName,
      periodStart: slip.periodStart,
      periodEnd: slip.periodEnd,
      hourlyRate: slip.hourlyRate,
      hoursWorked: slip.hoursWorked,
      grossPay: slip.grossPay,
    });
  };

  return (
    <div>
      <PageHeader title="Payslips" description="Every payslip ever issued, independent of which payroll run it came from." />

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      payslips.length === 0 ?
      <Card><EmptyState icon={FileTextIcon} title="No payslips yet" description="Finalizing a payroll run will generate one payslip per person here." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Person</th>
                  <th className="px-5 py-3 font-bold">Period</th>
                  <th className="px-5 py-3 text-right font-bold">Hours</th>
                  <th className="px-5 py-3 text-right font-bold">Gross pay</th>
                  <th className="px-5 py-3 text-right font-bold">Download</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((s) =>
              <tr key={s.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">
                      {s.subjectName}
                      <Badge tone={s.technicianId ? 'blue' : 'purple'} className="ml-1.5 align-middle">{s.technicianId ? 'Technician' : 'Employee'}</Badge>
                    </td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(s.periodStart)} – {formatDate(s.periodEnd)}</td>
                    <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{s.hoursWorked}</td>
                    <td className="px-5 py-3 text-right font-bold text-navy dark:text-slate-100">{formatCurrency(s.grossPay)}</td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => download(s)}><DownloadIcon className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        </Card>
      }
    </div>);

}
