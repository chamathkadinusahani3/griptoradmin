import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheckIcon, PlusIcon, CheckIcon, XIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { WarrantyClaim } from '../../types/warrantyClaim';
import { Customer } from '../../types/customer';
import { Part } from '../../types/part';
import { api, ApiError } from '../../lib/api';

const STATUS_TONE: Record<WarrantyClaim['status'], 'amber' | 'blue' | 'red' | 'green'> = {
  Open: 'amber',
  Approved: 'blue',
  Rejected: 'red',
  Resolved: 'green',
};

const emptyForm = { customerId: '', partId: '', issueDescription: '', providedDate: '', warrantyPeriodDays: '', notes: '' };

export function WarrantyClaims() {
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const [resolveTarget, setResolveTarget] = useState<WarrantyClaim | null>(null);
  const [resolution, setResolution] = useState('');
  const [resolving, setResolving] = useState(false);

  const loadClaims = () => {
    setLoading(true);
    api
      .get<{ claims: WarrantyClaim[] }>('/warranty-claims')
      .then(({ claims }) => setClaims(claims))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load warranty claims'))
      .finally(() => setLoading(false));
  };

  useEffect(loadClaims, []);
  useEffect(() => {
    api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([]));
    api.get<{ parts: Part[] }>('/parts').then(({ parts }) => setParts(parts)).catch(() => setParts([]));
  }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId || !form.issueDescription.trim()) {
      toast.error('A customer and issue description are required');
      return;
    }
    setSaving(true);
    try {
      const { claim } = await api.post<{ claim: WarrantyClaim }>('/warranty-claims', {
        customerId: form.customerId,
        partId: form.partId || undefined,
        issueDescription: form.issueDescription,
        providedDate: form.providedDate || undefined,
        warrantyPeriodDays: form.warrantyPeriodDays ? Number(form.warrantyPeriodDays) : undefined,
        notes: form.notes || undefined,
      });
      setClaims((prev) => [claim, ...prev]);
      toast.success(`${claim.claimNumber} logged`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to log warranty claim');
    } finally {
      setSaving(false);
    }
  };

  const respond = async (c: WarrantyClaim, action: 'approve' | 'reject') => {
    setActingId(c.id);
    try {
      const { claim } = await api.patch<{ claim: WarrantyClaim }>(`/warranty-claims/${c.id}`, { action });
      setClaims((prev) => prev.map((x) => (x.id === claim.id ? claim : x)));
      toast.success(action === 'approve' ? 'Claim approved' : 'Claim rejected');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update claim');
    } finally {
      setActingId(null);
    }
  };

  const submitResolve = async () => {
    if (!resolveTarget || !resolution.trim()) {
      toast.error('A resolution is required');
      return;
    }
    setResolving(true);
    try {
      const { claim } = await api.patch<{ claim: WarrantyClaim }>(`/warranty-claims/${resolveTarget.id}`, { action: 'resolve', resolution });
      setClaims((prev) => prev.map((x) => (x.id === claim.id ? claim : x)));
      toast.success('Claim resolved');
      setResolveTarget(null);
      setResolution('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to resolve claim');
    } finally {
      setResolving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Warranty Claims"
        description="A real tracked claim tied to a customer, part, and warranty period — not just a loose approval request."
        action={<Button onClick={openCreate} disabled={customers.length === 0}><PlusIcon className="h-4 w-4" /> Log claim</Button>} />


      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      claims.length === 0 ?
      <Card><EmptyState icon={ShieldCheckIcon} title="No warranty claims yet" description="Log a claim when a customer reports a problem with a part or job still under warranty." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Claim</th>
                  <th className="px-5 py-3 font-bold">Customer</th>
                  <th className="px-5 py-3 font-bold">Part / Issue</th>
                  <th className="px-5 py-3 font-bold">Warranty</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) =>
              <tr key={c.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">{c.claimNumber}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-300">{c.customerName}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">
                      {c.partName && <p className="font-semibold text-navy dark:text-slate-200">{c.partName}</p>}
                      {c.issueDescription}
                    </td>
                    <td className="px-5 py-3">
                      {c.withinWarranty === null ?
                  <span className="text-text-gray dark:text-slate-400">—</span> :
                  <Badge tone={c.withinWarranty ? 'green' : 'red'}>{c.withinWarranty ? 'Within warranty' : 'Expired'}</Badge>
                  }
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                      {c.status === 'Resolved' && c.resolution && <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{c.resolution}</p>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {c.status === 'Open' &&
                  <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => respond(c, 'approve')} loading={actingId === c.id}><CheckIcon className="h-3.5 w-3.5" /> Approve</Button>
                          <Button size="sm" variant="secondary" onClick={() => respond(c, 'reject')} loading={actingId === c.id}><XIcon className="h-3.5 w-3.5" /> Reject</Button>
                        </div>
                  }
                      {c.status === 'Approved' &&
                  <Button size="sm" onClick={() => setResolveTarget(c)}>Resolve</Button>
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
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Log warranty claim"
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="warranty-claim-form" type="submit" loading={saving}>Log claim</Button>
          </>
        }>
        <form id="warranty-claim-form" onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="wc-customer">Customer</Label>
            <Select id="wc-customer" value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}>
              <option value="">— select a customer —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          {parts.length > 0 &&
          <div>
              <Label htmlFor="wc-part">Part (optional)</Label>
              <Select id="wc-part" value={form.partId} onChange={(e) => setForm((f) => ({ ...f, partId: e.target.value }))}>
                <option value="">— none —</option>
                {parts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
          }
          <div>
            <Label htmlFor="wc-issue">Issue description</Label>
            <Textarea id="wc-issue" required value={form.issueDescription} onChange={(e) => setForm((f) => ({ ...f, issueDescription: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="wc-provided">Date provided (optional)</Label>
              <Input id="wc-provided" type="date" value={form.providedDate} onChange={(e) => setForm((f) => ({ ...f, providedDate: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="wc-period">Warranty period (days, optional)</Label>
              <Input id="wc-period" type="number" min={1} value={form.warrantyPeriodDays} onChange={(e) => setForm((f) => ({ ...f, warrantyPeriodDays: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="wc-notes">Notes (optional)</Label>
            <Textarea id="wc-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </form>
      </Modal>

      <Modal
        open={!!resolveTarget}
        onClose={() => setResolveTarget(null)}
        title={resolveTarget ? `Resolve ${resolveTarget.claimNumber}` : 'Resolve claim'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setResolveTarget(null)}>Cancel</Button>
            <Button onClick={submitResolve} loading={resolving}>Resolve</Button>
          </>
        }>
        <div>
          <Label htmlFor="wc-resolution">Resolution</Label>
          <Textarea id="wc-resolution" required placeholder="e.g. Replaced part, no charge" value={resolution} onChange={(e) => setResolution(e.target.value)} />
        </div>
      </Modal>
    </div>);

}
