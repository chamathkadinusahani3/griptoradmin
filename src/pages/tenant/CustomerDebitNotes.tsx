import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FilePlusIcon, PlusIcon, CheckIcon, XIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { CustomerDebitNote, CustomerDebitNoteStatus, CUSTOMER_DEBIT_NOTE_STATUSES } from '../../types/customerDebitNote';
import { CustomerInvoice } from '../../types/customerInvoice';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const STATUS_FILTERS: ('All' | CustomerDebitNoteStatus)[] = ['All', ...CUSTOMER_DEBIT_NOTE_STATUSES];

const emptyForm = { customerInvoiceId: '', amount: '', reason: '', notes: '' };

export function CustomerDebitNotes() {
  const [notes, setNotes] = useState<CustomerDebitNote[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'All' | CustomerDebitNoteStatus>('All');
  const [actingId, setActingId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [voidTarget, setVoidTarget] = useState<CustomerDebitNote | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get<{ customerDebitNotes: CustomerDebitNote[] }>('/customer-debit-notes')
      .then(({ customerDebitNotes }) => setNotes(customerDebitNotes))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load debit notes'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    api
      .get<{ invoices: CustomerInvoice[] }>('/customer-invoices')
      .then(({ invoices }) => setInvoices(invoices.filter((i) => i.status !== 'Void')))
      .catch(() => setInvoices([]));
  }, []);

  const filtered = statusFilter === 'All' ? notes : notes.filter((n) => n.status === statusFilter);

  const openCreate = () => {
    setForm({ ...emptyForm, customerInvoiceId: invoices[0]?.id ?? '' });
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerInvoiceId || !form.amount || Number(form.amount) <= 0 || !form.reason.trim()) {
      toast.error('An invoice, a positive amount, and a reason are required');
      return;
    }
    setSaving(true);
    try {
      const { customerDebitNote } = await api.post<{ customerDebitNote: CustomerDebitNote }>('/customer-debit-notes', {
        customerInvoiceId: form.customerInvoiceId,
        amount: Number(form.amount),
        reason: form.reason.trim(),
        notes: form.notes || undefined,
      });
      setNotes((prev) => [customerDebitNote, ...prev]);
      toast.success(`${customerDebitNote.debitNoteNumber} logged — confirm it to bill the invoice`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create debit note');
    } finally {
      setSaving(false);
    }
  };

  const confirm = async (note: CustomerDebitNote) => {
    setActingId(note.id);
    try {
      const { customerDebitNote } = await api.patch<{ customerDebitNote: CustomerDebitNote }>(`/customer-debit-notes/${note.id}`, { action: 'confirm' });
      setNotes((prev) => prev.map((n) => (n.id === customerDebitNote.id ? customerDebitNote : n)));
      toast.success(`${customerDebitNote.debitNoteNumber} confirmed — the invoice has been billed`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to confirm debit note');
    } finally {
      setActingId(null);
    }
  };

  const submitVoid = async () => {
    if (!voidTarget || !voidReason.trim()) {
      toast.error('A reason is required');
      return;
    }
    setVoiding(true);
    try {
      const { customerDebitNote } = await api.patch<{ customerDebitNote: CustomerDebitNote }>(`/customer-debit-notes/${voidTarget.id}`, { action: 'void', reason: voidReason });
      setNotes((prev) => prev.map((n) => (n.id === customerDebitNote.id ? customerDebitNote : n)));
      toast.success(`${customerDebitNote.debitNoteNumber} voided`);
      setVoidTarget(null);
      setVoidReason('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to void debit note');
    } finally {
      setVoiding(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Customer Debit Notes"
        description="Bill a customer extra after the fact — freight, a price correction, a found charge. Starts Pending; confirming it adds the amount to the invoice's total and balance."
        action={<Button onClick={openCreate} disabled={invoices.length === 0}><PlusIcon className="h-4 w-4" /> New debit note</Button>} />

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
      <Card><EmptyState icon={FilePlusIcon} title="No customer debit notes" description="Raise one against an existing invoice to bill a customer extra." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Debit note</th>
                  <th className="px-5 py-3 font-bold">Invoice</th>
                  <th className="px-5 py-3 font-bold">Customer</th>
                  <th className="px-5 py-3 text-right font-bold">Amount</th>
                  <th className="px-5 py-3 font-bold">Reason</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold">Date</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((n) =>
              <tr key={n.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">{n.debitNoteNumber}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-300">{n.invoiceNumber ?? '—'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-300">{n.customerName ?? '—'}</td>
                    <td className="px-5 py-3 text-right font-semibold text-navy dark:text-slate-100">{formatCurrency(n.amount)}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{n.reason}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={n.status} />
                      {n.status === 'Void' && n.voidReason && <p className="mt-1 text-xs text-text-gray dark:text-slate-500">{n.voidReason}</p>}
                    </td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(n.createdAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        {n.status === 'Pending' &&
                    <>
                          <Button size="sm" variant="secondary" loading={actingId === n.id} onClick={() => confirm(n)}><CheckIcon className="h-3.5 w-3.5" /> Confirm</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setVoidTarget(n); setVoidReason(''); }}><XIcon className="h-3.5 w-3.5" /> Void</Button>
                        </>
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
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New customer debit note"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="customer-debit-note-form" type="submit" loading={saving}>Create</Button>
          </>
        }>
        <form id="customer-debit-note-form" onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="cdn-invoice">Invoice</Label>
            <Select id="cdn-invoice" value={form.customerInvoiceId} onChange={(e) => setForm((f) => ({ ...f, customerInvoiceId: e.target.value }))}>
              {invoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.invoiceNumber} — {inv.customer ?? 'Unknown customer'} (balance {formatCurrency(inv.balance)})</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="cdn-amount">Amount to bill</Label>
            <Input id="cdn-amount" type="number" min={0} required value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="cdn-reason">Reason</Label>
            <Input id="cdn-reason" required value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. Freight charge not included on the original invoice" />
          </div>
          <div>
            <Label htmlFor="cdn-notes">Notes (optional)</Label>
            <Textarea id="cdn-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </form>
      </Modal>

      <Modal
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        title={voidTarget ? `Void ${voidTarget.debitNoteNumber}` : 'Void debit note'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setVoidTarget(null)}>Cancel</Button>
            <Button onClick={submitVoid} loading={voiding}>Void</Button>
          </>
        }>
        <div>
          <Label htmlFor="cdn-void-reason">Reason</Label>
          <Textarea id="cdn-void-reason" required value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="e.g. Raised in error" />
        </div>
      </Modal>
    </div>);
}
