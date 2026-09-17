import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileCheckIcon, ArrowDownLeftIcon, ArrowUpRightIcon, CalendarClockIcon, XIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Input, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Cheque, ChequeStatus, CHEQUE_STATUSES } from '../../types/cheque';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const STATUS_FILTERS: ('All' | ChequeStatus)[] = ['All', ...CHEQUE_STATUSES];

export function Cheques() {
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'All' | ChequeStatus>('All');
  const [actingId, setActingId] = useState<string | null>(null);

  const [extendTarget, setExtendTarget] = useState<Cheque | null>(null);
  const [extendDate, setExtendDate] = useState('');
  const [extending, setExtending] = useState(false);

  const [returnTarget, setReturnTarget] = useState<Cheque | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [returning, setReturning] = useState(false);

  const loadCheques = () => {
    setLoading(true);
    api
      .get<{ cheques: Cheque[] }>('/cheques')
      .then(({ cheques }) => setCheques(cheques))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load cheques'))
      .finally(() => setLoading(false));
  };

  useEffect(loadCheques, []);

  const filtered = statusFilter === 'All' ? cheques : cheques.filter((c) => c.status === statusFilter);

  const setStatus = async (cheque: Cheque, action: 'deposit' | 'clear') => {
    setActingId(cheque.id);
    try {
      const { cheque: updated } = await api.patch<{ cheque: Cheque }>(`/cheques/${cheque.id}`, { action });
      setCheques((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      toast.success(`Cheque #${updated.chequeNumber} marked ${updated.status}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update cheque');
    } finally {
      setActingId(null);
    }
  };

  const openExtend = (cheque: Cheque) => {
    setExtendTarget(cheque);
    setExtendDate(cheque.dueDate ? cheque.dueDate.slice(0, 10) : '');
  };

  const submitExtend = async () => {
    if (!extendTarget || !extendDate) {
      toast.error('Pick a new due date');
      return;
    }
    setExtending(true);
    try {
      const { cheque } = await api.patch<{ cheque: Cheque }>(`/cheques/${extendTarget.id}`, { action: 'extend', dueDate: extendDate });
      setCheques((prev) => prev.map((c) => (c.id === cheque.id ? cheque : c)));
      toast.success(`Cheque #${cheque.chequeNumber} extended to ${formatDate(cheque.dueDate ?? extendDate)}`);
      setExtendTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to extend cheque');
    } finally {
      setExtending(false);
    }
  };

  const submitReturn = async () => {
    if (!returnTarget || !returnReason.trim()) {
      toast.error('A reason is required');
      return;
    }
    setReturning(true);
    try {
      const { cheque } = await api.post<{ cheque: Cheque }>(`/cheques/${returnTarget.id}/return`, { reason: returnReason });
      setCheques((prev) => prev.map((c) => (c.id === cheque.id ? cheque : c)));
      toast.success(`Cheque #${cheque.chequeNumber} marked Returned`);
      setReturnTarget(null);
      setReturnReason('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to return cheque');
    } finally {
      setReturning(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Cheques"
        description="Cheque payments received or issued through invoice and purchase order payments." />

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) =>
        <button
          key={s}
          onClick={() => setStatusFilter(s)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${statusFilter === s ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>

            {s}
          </button>
        )}
      </div>

      {loading ?
      <Card><div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div></Card> :
      filtered.length === 0 ?
      <Card><EmptyState icon={FileCheckIcon} title="No cheques" description="Cheques recorded against an invoice or purchase order payment will show up here." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Cheque #</th>
                  <th className="px-5 py-3 font-bold">Direction</th>
                  <th className="px-5 py-3 font-bold">Linked to</th>
                  <th className="px-5 py-3 text-right font-bold">Amount</th>
                  <th className="px-5 py-3 font-bold">Due date</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) =>
              <tr key={c.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">{c.chequeNumber}</td>
                    <td className="px-5 py-3">
                      <Badge tone={c.direction === 'incoming' ? 'green' : 'amber'}>
                        {c.direction === 'incoming' ? <ArrowDownLeftIcon className="h-3 w-3" /> : <ArrowUpRightIcon className="h-3 w-3" />}
                        {c.direction === 'incoming' ? 'Incoming' : 'Outgoing'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">
                      {c.sourceNumber ?? '—'}
                      <span className="block text-xs">{c.customerName ?? c.supplierName ?? ''}</span>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-navy dark:text-slate-100">{formatCurrency(c.amount)}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{c.dueDate ? formatDate(c.dueDate) : '—'}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={c.status} />
                      {c.status === 'Returned' && c.returnedReason && <p className="mt-1 text-xs text-text-gray dark:text-slate-500">{c.returnedReason}</p>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {c.status !== 'Returned' &&
                    <Button size="sm" variant="ghost" onClick={() => openExtend(c)}><CalendarClockIcon className="h-3.5 w-3.5" /> Extend</Button>
                    }
                        {c.status === 'Issued' &&
                    <Button size="sm" variant="secondary" loading={actingId === c.id} onClick={() => setStatus(c, 'deposit')}>Mark Deposited</Button>
                    }
                        {c.status === 'Deposited' &&
                    <Button size="sm" variant="secondary" loading={actingId === c.id} onClick={() => setStatus(c, 'clear')}>Mark Cleared</Button>
                    }
                        {c.status !== 'Returned' &&
                    <Button size="sm" variant="ghost" onClick={() => { setReturnTarget(c); setReturnReason(''); }}><XIcon className="h-3.5 w-3.5" /> Return</Button>
                    }
                      </div>
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        </Card>
      }

      <Modal
        open={!!extendTarget}
        onClose={() => setExtendTarget(null)}
        title={extendTarget ? `Extend cheque #${extendTarget.chequeNumber}` : 'Extend cheque'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setExtendTarget(null)}>Cancel</Button>
            <Button onClick={submitExtend} loading={extending}>Extend</Button>
          </>
        }>
        <div>
          <Label htmlFor="extend-date">New due date</Label>
          <Input id="extend-date" type="date" value={extendDate} onChange={(e) => setExtendDate(e.target.value)} />
        </div>
      </Modal>

      <Modal
        open={!!returnTarget}
        onClose={() => setReturnTarget(null)}
        title={returnTarget ? `Return cheque #${returnTarget.chequeNumber}` : 'Return cheque'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setReturnTarget(null)}>Cancel</Button>
            <Button onClick={submitReturn} loading={returning}>Mark Returned</Button>
          </>
        }>
        {returnTarget &&
        <div className="space-y-4">
            <p className="text-sm text-text-gray dark:text-slate-400">
              This reopens the {formatCurrency(returnTarget.amount)} balance on {returnTarget.sourceNumber} and reverses the GL entry for this payment.
            </p>
            <div>
              <Label htmlFor="return-reason">Reason</Label>
              <Textarea id="return-reason" required value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="e.g. Insufficient funds" />
            </div>
          </div>
        }
      </Modal>
    </div>);

}
