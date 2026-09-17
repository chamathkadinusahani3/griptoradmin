import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HandCoinsIcon, PlusIcon, ArrowRightIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { CashHandover } from '../../types/cashHandover';
import { TenantUser } from '../../types/tenantUser';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const emptyForm = { handedOverBy: '', receivedBy: '', amount: '', date: '', notes: '' };

export function CashHandovers() {
  const [handovers, setHandovers] = useState<CashHandover[]>([]);
  const [staff, setStaff] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadHandovers = () => {
    setLoading(true);
    api
      .get<{ cashHandovers: CashHandover[] }>('/cash-handovers')
      .then(({ cashHandovers }) => setHandovers(cashHandovers))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load cash handovers'))
      .finally(() => setLoading(false));
  };

  useEffect(loadHandovers, []);
  useEffect(() => {
    api.get<{ staff: TenantUser[] }>('/staff').then(({ staff }) => setStaff(staff)).catch(() => setStaff([]));
  }, []);

  const openCreate = () => {
    setForm({ ...emptyForm, date: new Date().toISOString().slice(0, 10) });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.handedOverBy || !form.receivedBy || !form.amount || Number(form.amount) <= 0 || !form.date) {
      toast.error('Handed over by, received by, a positive amount, and date are required');
      return;
    }
    if (form.handedOverBy === form.receivedBy) {
      toast.error('Handed over by and received by must be different people');
      return;
    }
    setSaving(true);
    try {
      const { cashHandover } = await api.post<{ cashHandover: CashHandover }>('/cash-handovers', {
        handedOverBy: form.handedOverBy,
        receivedBy: form.receivedBy,
        amount: Number(form.amount),
        date: form.date,
        notes: form.notes || undefined,
      });
      setHandovers((prev) => [cashHandover, ...prev]);
      toast.success(`${cashHandover.cashHandoverNumber} recorded`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record cash handover');
    } finally {
      setSaving(false);
    }
  };

  const noPrereqs = staff.length < 2;

  return (
    <div>
      <PageHeader
        title="Cash Handovers"
        description="A physical handover of already-collected cash between two staff members — for reconciliation, not a new financial event."
        action={<Button onClick={openCreate} disabled={noPrereqs} title={noPrereqs ? 'Need at least two staff members' : undefined}><PlusIcon className="h-4 w-4" /> New handover</Button>} />


      {loading ?
      <Card><div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div></Card> :
      handovers.length === 0 ?
      <Card><EmptyState icon={HandCoinsIcon} title="No cash handovers" description="Record cash physically handed from one staff member to another." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {handovers.map((h) =>
          <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-bold text-navy dark:text-slate-100">{h.cashHandoverNumber}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-text-gray dark:text-slate-400">
                    {h.handedOverByName ?? '—'} <ArrowRightIcon className="h-3 w-3" /> {h.receivedByName ?? '—'}
                  </p>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{formatDate(h.date)}</p>
                  {h.notes && <p className="mt-1 text-xs text-text-gray dark:text-slate-500">{h.notes}</p>}
                </div>
                <Badge tone="teal">{formatCurrency(h.amount)}</Badge>
              </li>
          )}
          </ul>
        </Card>
      }

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New cash handover"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Record handover</Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="ch-from">Handed over by</Label>
            <Select id="ch-from" value={form.handedOverBy} onChange={(e) => setForm({ ...form, handedOverBy: e.target.value })}>
              <option value="">— select —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="ch-to">Received by</Label>
            <Select id="ch-to" value={form.receivedBy} onChange={(e) => setForm({ ...form, receivedBy: e.target.value })}>
              <option value="">— select —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ch-amount">Amount</Label>
              <Input id="ch-amount" type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ch-date">Date</Label>
              <Input id="ch-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div>
            <Label htmlFor="ch-notes">Notes (optional)</Label>
            <Textarea id="ch-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>);

}
