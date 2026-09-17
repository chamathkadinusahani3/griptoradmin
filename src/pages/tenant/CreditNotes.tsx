import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileMinusIcon, XIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { CreditNote, CreditNoteStatus, CREDIT_NOTE_STATUSES } from '../../types/creditNote';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const STATUS_FILTERS: ('All' | CreditNoteStatus)[] = ['All', ...CREDIT_NOTE_STATUSES];

export function CreditNotes() {
  const [notes, setNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'All' | CreditNoteStatus>('All');

  const [voidTarget, setVoidTarget] = useState<CreditNote | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get<{ creditNotes: CreditNote[] }>('/credit-notes')
      .then(({ creditNotes }) => setNotes(creditNotes))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load credit notes'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = statusFilter === 'All' ? notes : notes.filter((n) => n.status === statusFilter);

  const submitVoid = async () => {
    if (!voidTarget || !voidReason.trim()) {
      toast.error('A reason is required');
      return;
    }
    setVoiding(true);
    try {
      const { creditNote } = await api.patch<{ creditNote: CreditNote }>(`/credit-notes/${voidTarget.id}`, { action: 'void', reason: voidReason });
      setNotes((prev) => prev.map((n) => (n.id === creditNote.id ? creditNote : n)));
      toast.success(`${creditNote.creditNoteNumber} voided`);
      setVoidTarget(null);
      setVoidReason('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to void credit note');
    } finally {
      setVoiding(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Credit Notes"
        description="Formal credit issued for goods a customer returned — created automatically alongside the return." />

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
      <Card><EmptyState icon={FileMinusIcon} title="No credit notes" description="Recording a customer return will create one here automatically." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Credit note</th>
                  <th className="px-5 py-3 font-bold">Return</th>
                  <th className="px-5 py-3 font-bold">Reason</th>
                  <th className="px-5 py-3 text-right font-bold">Amount</th>
                  <th className="px-5 py-3 text-right font-bold">Remaining</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold">Date</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((n) =>
              <tr key={n.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">{n.creditNoteNumber}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-300">{n.returnNumber ?? '—'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{n.reason ?? '—'}</td>
                    <td className="px-5 py-3 text-right font-semibold text-navy dark:text-slate-100">{formatCurrency(n.amount)}</td>
                    <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{formatCurrency(n.remainingAmount)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={n.status} />
                      {n.status === 'Void' && n.voidReason && <p className="mt-1 text-xs text-text-gray dark:text-slate-500">{n.voidReason}</p>}
                    </td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(n.createdAt)}</td>
                    <td className="px-5 py-3 text-right">
                      {n.status !== 'Void' &&
                  <Button size="sm" variant="ghost" onClick={() => { setVoidTarget(n); setVoidReason(''); }}><XIcon className="h-3.5 w-3.5" /> Void</Button>
                  }
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        </Card>
      }

      <Modal
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        title={voidTarget ? `Void ${voidTarget.creditNoteNumber}` : 'Void credit note'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setVoidTarget(null)}>Cancel</Button>
            <Button onClick={submitVoid} loading={voiding}>Void</Button>
          </>
        }>
        <div>
          <Label htmlFor="void-reason">Reason</Label>
          <Textarea id="void-reason" required value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="e.g. Issued in error" />
        </div>
      </Modal>
    </div>);

}
