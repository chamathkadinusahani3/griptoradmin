import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileTextIcon, PlusIcon, XIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { EffectiveNote, EffectiveNoteStatus, EFFECTIVE_NOTE_STATUSES } from '../../types/effectiveNote';
import { Customer } from '../../types/customer';
import { WarrantyClaim } from '../../types/warrantyClaim';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const STATUS_FILTERS: ('All' | EffectiveNoteStatus)[] = ['All', ...EFFECTIVE_NOTE_STATUSES];

// Dealer Credit Control roadmap Module 2 — a credit raised when a
// manufacturer/supplier underclaims a tyre warranty claim (approves less
// than what was claimed); the shortfall becomes credit the customer can
// apply against a future invoice via Utilization.
export function EffectiveNotes() {
  const [notes, setNotes] = useState<EffectiveNote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'All' | EffectiveNoteStatus>('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [warrantyClaimId, setWarrantyClaimId] = useState('');
  const [claimedAmount, setClaimedAmount] = useState('');
  const [approvedAmount, setApprovedAmount] = useState('');
  const [reason, setReason] = useState('');
  const [notesText, setNotesText] = useState('');
  const [saving, setSaving] = useState(false);

  const [voidTarget, setVoidTarget] = useState<EffectiveNote | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get<{ effectiveNotes: EffectiveNote[] }>('/effective-notes')
      .then(({ effectiveNotes }) => setNotes(effectiveNotes))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load effective notes'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([]));
    api.get<{ warrantyClaims: WarrantyClaim[] }>('/warranty-claims').then(({ warrantyClaims }) => setClaims(warrantyClaims)).catch(() => setClaims([]));
  }, []);

  const filtered = statusFilter === 'All' ? notes : notes.filter((n) => n.status === statusFilter);
  const claimsForCustomer = claims.filter((c) => c.customerId === customerId);
  const shortfall = Number(claimedAmount) > 0 && Number(approvedAmount) >= 0 ? Number(claimedAmount) - Number(approvedAmount) : null;

  const openCreate = () => {
    setCustomerId('');
    setWarrantyClaimId('');
    setClaimedAmount('');
    setApprovedAmount('');
    setReason('');
    setNotesText('');
    setModalOpen(true);
  };

  const save = async () => {
    if (!customerId || !claimedAmount || !reason.trim()) {
      toast.error('Customer, claimed amount, and a reason are required');
      return;
    }
    if (Number(approvedAmount) >= Number(claimedAmount)) {
      toast.error('Approved amount must be less than claimed amount — otherwise there is no underclaim shortfall to note');
      return;
    }
    setSaving(true);
    try {
      const { effectiveNote } = await api.post<{ effectiveNote: EffectiveNote }>('/effective-notes', {
        customerId,
        warrantyClaimId: warrantyClaimId || undefined,
        claimedAmount: Number(claimedAmount),
        approvedAmount: Number(approvedAmount) || 0,
        reason: reason.trim(),
        notes: notesText || undefined,
      });
      setNotes((prev) => [effectiveNote, ...prev]);
      toast.success(`${effectiveNote.effectiveNoteNumber} recorded — ${formatCurrency(effectiveNote.amount)} credit`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record effective note');
    } finally {
      setSaving(false);
    }
  };

  const submitVoid = async () => {
    if (!voidTarget || !voidReason.trim()) {
      toast.error('A reason is required');
      return;
    }
    setVoiding(true);
    try {
      const { effectiveNote } = await api.patch<{ effectiveNote: EffectiveNote }>(`/effective-notes/${voidTarget.id}`, { action: 'void', reason: voidReason });
      setNotes((prev) => prev.map((n) => (n.id === effectiveNote.id ? effectiveNote : n)));
      toast.success(`${effectiveNote.effectiveNoteNumber} voided`);
      setVoidTarget(null);
      setVoidReason('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to void effective note');
    } finally {
      setVoiding(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Effective Notes"
        description="A warranty-claim underclaim credit — when a supplier approves less than what was claimed, the shortfall becomes credit for the customer."
        action={<Button onClick={openCreate} disabled={customers.length === 0}><PlusIcon className="h-4 w-4" /> New effective note</Button>} />

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
      <Card><EmptyState icon={FileTextIcon} title="No effective notes" description="Record one when a warranty claim comes back underclaimed." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {filtered.map((n) =>
          <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-navy dark:text-slate-100">{n.effectiveNoteNumber}</p>
                    <StatusBadge status={n.status} />
                  </div>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">
                    {n.customerName} {n.warrantyClaimNumber ? `· ${n.warrantyClaimNumber}` : ''} · claimed {formatCurrency(n.claimedAmount)}, approved {formatCurrency(n.approvedAmount)}
                  </p>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{n.reason} · {formatDate(n.createdAt)}</p>
                  {n.appliedAmount > 0 && <p className="mt-1 text-xs text-text-gray dark:text-slate-400">Applied: {formatCurrency(n.appliedAmount)} · Remaining: {formatCurrency(n.remainingAmount)}</p>}
                  {n.status === 'Void' && n.voidReason && <p className="mt-1 text-xs text-text-gray dark:text-slate-500">{n.voidReason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="teal">{formatCurrency(n.amount)}</Badge>
                  {n.status === 'Open' && n.appliedAmount === 0 &&
              <Button size="sm" variant="ghost" onClick={() => { setVoidTarget(n); setVoidReason(''); }}><XIcon className="h-3.5 w-3.5" /> Void</Button>
              }
                </div>
              </li>
          )}
          </ul>
        </Card>
      }

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New effective note"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Record effective note</Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="efn-customer">Customer</Label>
            <Select id="efn-customer" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setWarrantyClaimId(''); }}>
              <option value="">— select —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="efn-claim">Warranty claim (optional)</Label>
            <Select id="efn-claim" value={warrantyClaimId} onChange={(e) => setWarrantyClaimId(e.target.value)} disabled={!customerId}>
              <option value="">— none —</option>
              {claimsForCustomer.map((c) => <option key={c.id} value={c.id}>{c.claimNumber} — {c.partName ?? c.issueDescription}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="efn-claimed">Claimed amount</Label>
              <Input id="efn-claimed" type="number" min={0} value={claimedAmount} onChange={(e) => setClaimedAmount(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="efn-approved">Approved amount</Label>
              <Input id="efn-approved" type="number" min={0} value={approvedAmount} onChange={(e) => setApprovedAmount(e.target.value)} />
            </div>
          </div>
          {shortfall != null && shortfall > 0 &&
          <p className="text-sm text-text-gray dark:text-slate-400">Shortfall (credit to customer): <span className="font-bold text-navy dark:text-slate-100">{formatCurrency(shortfall)}</span></p>
          }
          <div>
            <Label htmlFor="efn-reason">Reason</Label>
            <Input id="efn-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Manufacturer approved 60% pro-rated warranty" />
          </div>
          <div>
            <Label htmlFor="efn-notes">Notes (optional)</Label>
            <Textarea id="efn-notes" value={notesText} onChange={(e) => setNotesText(e.target.value)} />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        title={voidTarget ? `Void ${voidTarget.effectiveNoteNumber}` : 'Void effective note'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setVoidTarget(null)}>Cancel</Button>
            <Button onClick={submitVoid} loading={voiding}>Void</Button>
          </>
        }>
        <div>
          <Label htmlFor="efn-void-reason">Reason</Label>
          <Textarea id="efn-void-reason" required value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="e.g. Entered in error" />
        </div>
      </Modal>
    </div>);

}
