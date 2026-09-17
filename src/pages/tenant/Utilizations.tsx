import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ShuffleIcon, PlusIcon, ArrowRightIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Utilization, UtilizationSourceType, UtilizationTargetType, UTILIZATION_SOURCE_TYPES, UTILIZATION_TARGET_TYPES } from '../../types/utilization';
import { CreditNote } from '../../types/creditNote';
import { DebitNote } from '../../types/debitNote';
import { AdvancePayment } from '../../types/advancePayment';
import { Receipt } from '../../types/receipt';
import { CustomerInvoice } from '../../types/customerInvoice';
import { PurchaseOrder } from '../../types/purchaseOrder';
import { Return } from '../../types/return';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const SOURCE_TYPE_LABELS: Record<UtilizationSourceType, string> = {
  creditNote: 'Credit Note',
  debitNote: 'Debit Note',
  advancePayment: 'Advance Payment',
  receipt: 'Receipt (on-account)',
};
const TARGET_TYPE_LABELS: Record<UtilizationTargetType, string> = {
  invoice: 'Invoice',
  return: 'Return',
};

const emptyForm = {
  sourceType: 'creditNote' as UtilizationSourceType,
  sourceId: '',
  targetType: 'invoice' as UtilizationTargetType,
  targetId: '',
  amount: '',
  date: '',
  notes: '',
};

interface SourceOption {
  id: string;
  label: string;
  remaining: number;
  direction: 'customer' | 'supplier';
  excludeReturnId?: string;
}
interface TargetOption {
  id: string;
  label: string;
  outstanding: number;
}

export function Utilizations() {
  const [utilizations, setUtilizations] = useState<Utilization[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [debitNotes, setDebitNotes] = useState<DebitNote[]>([]);
  const [advancePayments, setAdvancePayments] = useState<AdvancePayment[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [returns, setReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadUtilizations = () => {
    setLoading(true);
    api
      .get<{ utilizations: Utilization[] }>('/utilizations')
      .then(({ utilizations }) => setUtilizations(utilizations))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load utilizations'))
      .finally(() => setLoading(false));
  };

  useEffect(loadUtilizations, []);
  useEffect(() => {
    api.get<{ creditNotes: CreditNote[] }>('/credit-notes').then(({ creditNotes }) => setCreditNotes(creditNotes)).catch(() => setCreditNotes([]));
    api.get<{ debitNotes: DebitNote[] }>('/debit-notes').then(({ debitNotes }) => setDebitNotes(debitNotes)).catch(() => setDebitNotes([]));
    api.get<{ advancePayments: AdvancePayment[] }>('/advance-payments').then(({ advancePayments }) => setAdvancePayments(advancePayments)).catch(() => setAdvancePayments([]));
    api.get<{ receipts: Receipt[] }>('/receipts').then(({ receipts }) => setReceipts(receipts)).catch(() => setReceipts([]));
    api.get<{ invoices: CustomerInvoice[] }>('/customer-invoices').then(({ invoices }) => setInvoices(invoices)).catch(() => setInvoices([]));
    api.get<{ purchaseOrders: PurchaseOrder[] }>('/purchase-orders').then(({ purchaseOrders }) => setPurchaseOrders(purchaseOrders)).catch(() => setPurchaseOrders([]));
    api.get<{ returns: Return[] }>('/returns').then(({ returns }) => setReturns(returns)).catch(() => setReturns([]));
  }, []);

  const sourceOptions: SourceOption[] = useMemo(() => {
    if (form.sourceType === 'creditNote') {
      return creditNotes
        .filter((n) => n.status !== 'Void' && n.remainingAmount > 0.005)
        .map((n) => ({ id: n.id, label: `${n.creditNoteNumber} (${formatCurrency(n.remainingAmount)} available)`, remaining: n.remainingAmount, direction: 'customer' as const, excludeReturnId: n.returnId }));
    }
    if (form.sourceType === 'debitNote') {
      return debitNotes
        .filter((n) => n.status === 'Confirmed' && n.remainingAmount > 0.005)
        .map((n) => ({ id: n.id, label: `${n.debitNoteNumber} — ${n.supplierName ?? ''} (${formatCurrency(n.remainingAmount)} available)`, remaining: n.remainingAmount, direction: 'supplier' as const, excludeReturnId: n.returnId }));
    }
    if (form.sourceType === 'advancePayment') {
      return advancePayments
        .filter((p) => p.status !== 'Void' && p.remainingAmount > 0.005)
        .map((p) => ({
          id: p.id,
          label: `${p.advancePaymentNumber} — ${p.direction === 'customer' ? p.customerName : p.supplierName} (${formatCurrency(p.remainingAmount)} available)`,
          remaining: p.remainingAmount,
          direction: p.direction,
        }));
    }
    return receipts
      .filter((r) => r.onAccountAmount - r.onAccountAppliedAmount > 0.005)
      .map((r) => ({
        id: r.id,
        label: `${r.receiptNumber} — ${r.customerName ?? ''} (${formatCurrency(r.onAccountAmount - r.onAccountAppliedAmount)} available)`,
        remaining: r.onAccountAmount - r.onAccountAppliedAmount,
        direction: 'customer' as const,
      }));
  }, [form.sourceType, creditNotes, debitNotes, advancePayments, receipts]);

  const selectedSource = sourceOptions.find((s) => s.id === form.sourceId);

  const targetOptions: TargetOption[] = useMemo(() => {
    if (!selectedSource) return [];
    if (form.targetType === 'invoice') {
      if (selectedSource.direction === 'customer') {
        return invoices
          .filter((i) => i.status !== 'Void' && i.balance > 0.005)
          .map((i) => ({ id: i.id, label: `${i.invoiceNumber} — ${i.customer ?? ''} (${formatCurrency(i.balance)} owed)`, outstanding: i.balance }));
      }
      return purchaseOrders
        .filter((o) => ['Ordered', 'Partially Received', 'Received'].includes(o.status) && o.balance > 0.005)
        .map((o) => ({ id: o.id, label: `${o.poNumber} — ${o.supplier ?? ''} (${formatCurrency(o.balance)} owed)`, outstanding: o.balance }));
    }
    return returns
      .filter((r) => r.direction === selectedSource.direction && r.id !== selectedSource.excludeReturnId && r.totalAmount - (r.refundAmount ?? 0) > 0.005)
      .map((r) => ({ id: r.id, label: `${r.returnNumber} (${formatCurrency(r.totalAmount - (r.refundAmount ?? 0))} owed)`, outstanding: r.totalAmount - (r.refundAmount ?? 0) }));
  }, [selectedSource, form.targetType, invoices, purchaseOrders, returns]);

  const selectedTarget = targetOptions.find((t) => t.id === form.targetId);
  const maxAmount = selectedSource && selectedTarget ? Math.min(selectedSource.remaining, selectedTarget.outstanding) : undefined;

  const openCreate = () => {
    setForm({ ...emptyForm, date: new Date().toISOString().slice(0, 10) });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.sourceId || !form.targetId || !form.amount || Number(form.amount) <= 0 || !form.date) {
      toast.error('A source, a target, a positive amount, and date are required');
      return;
    }
    if (maxAmount != null && Number(form.amount) > maxAmount + 0.005) {
      toast.error(`Amount cannot exceed ${formatCurrency(maxAmount)}`);
      return;
    }
    setSaving(true);
    try {
      const { utilization } = await api.post<{ utilization: Utilization }>('/utilizations', {
        sourceType: form.sourceType,
        sourceId: form.sourceId,
        targetType: form.targetType,
        targetId: form.targetId,
        amount: Number(form.amount),
        date: form.date,
        notes: form.notes || undefined,
      });
      setUtilizations((prev) => [utilization, ...prev]);
      toast.success(`${utilization.utilizationNumber} recorded`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record utilization');
    } finally {
      setSaving(false);
    }
  };

  const noPrereqs = creditNotes.length === 0 && debitNotes.length === 0 && advancePayments.length === 0 && receipts.length === 0;

  return (
    <div>
      <PageHeader
        title="Utilization"
        description="Apply an existing credit note, debit note, advance payment, or on-account receipt against an outstanding invoice, purchase order, or return."
        action={<Button onClick={openCreate} disabled={noPrereqs} title={noPrereqs ? 'No credit notes, debit notes, advance payments, or receipts with an unapplied balance yet' : undefined}><PlusIcon className="h-4 w-4" /> New utilization</Button>} />


      {loading ?
      <Card><div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div></Card> :
      utilizations.length === 0 ?
      <Card><EmptyState icon={ShuffleIcon} title="No utilizations" description="Apply an unapplied credit against an outstanding balance to see it here." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {utilizations.map((u) =>
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-bold text-navy dark:text-slate-100">{u.utilizationNumber}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-text-gray dark:text-slate-400">
                    <Badge tone="gray">{SOURCE_TYPE_LABELS[u.sourceType]}</Badge> {u.sourceLabel ?? '—'}
                    <ArrowRightIcon className="h-3 w-3" />
                    <Badge tone="gray">{TARGET_TYPE_LABELS[u.targetType]}</Badge> {u.targetLabel ?? '—'}
                  </p>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{formatDate(u.date)}</p>
                  {u.notes && <p className="mt-1 text-xs text-text-gray dark:text-slate-500">{u.notes}</p>}
                </div>
                <Badge tone="teal">{formatCurrency(u.amount)}</Badge>
              </li>
          )}
          </ul>
        </Card>
      }

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New utilization"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Apply</Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="util-source-type">Source type</Label>
            <Select
              id="util-source-type"
              value={form.sourceType}
              onChange={(e) => setForm((f) => ({ ...f, sourceType: e.target.value as UtilizationSourceType, sourceId: '', targetId: '' }))}>

              {UTILIZATION_SOURCE_TYPES.map((t) => <option key={t} value={t}>{SOURCE_TYPE_LABELS[t]}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="util-source">Source</Label>
            <Select id="util-source" value={form.sourceId} onChange={(e) => setForm((f) => ({ ...f, sourceId: e.target.value, targetId: '' }))}>
              <option value="">— select —</option>
              {sourceOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
            {sourceOptions.length === 0 && <p className="mt-1 text-xs text-text-gray dark:text-slate-400">No {SOURCE_TYPE_LABELS[form.sourceType].toLowerCase()} has an unapplied balance right now.</p>}
          </div>
          <div>
            <Label htmlFor="util-target-type">Target type</Label>
            <Select
              id="util-target-type"
              value={form.targetType}
              onChange={(e) => setForm((f) => ({ ...f, targetType: e.target.value as UtilizationTargetType, targetId: '' }))}>

              {UTILIZATION_TARGET_TYPES.map((t) => <option key={t} value={t}>{TARGET_TYPE_LABELS[t]}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="util-target">Target</Label>
            <Select id="util-target" disabled={!selectedSource} value={form.targetId} onChange={(e) => setForm((f) => ({ ...f, targetId: e.target.value }))}>
              <option value="">— select a source first —</option>
              {targetOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
            {selectedSource && targetOptions.length === 0 && <p className="mt-1 text-xs text-text-gray dark:text-slate-400">No matching {TARGET_TYPE_LABELS[form.targetType].toLowerCase()} has an outstanding balance.</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="util-amount">Amount</Label>
              <Input id="util-amount" type="number" min={0} max={maxAmount} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
              {maxAmount != null && <p className="mt-1 text-xs text-text-gray dark:text-slate-400">Up to {formatCurrency(maxAmount)}</p>}
            </div>
            <div>
              <Label htmlFor="util-date">Date</Label>
              <Input id="util-date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="util-notes">Notes (optional)</Label>
            <Textarea id="util-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </Modal>
    </div>);

}
