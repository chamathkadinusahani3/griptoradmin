import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileWarningIcon, PlusIcon, CheckIcon, XIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { SupplierClaim, SUPPLIER_CLAIM_REASONS, SupplierClaimReason, SETTLEMENT_METHODS, SettlementMethod } from '../../types/supplierClaim';
import { Supplier } from '../../types/supplier';
import { PurchaseOrder } from '../../types/purchaseOrder';
import { formatCurrency } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const STATUS_TONE: Record<SupplierClaim['status'], 'amber' | 'blue' | 'red' | 'green'> = {
  Open: 'amber',
  Accepted: 'blue',
  Rejected: 'red',
  Settled: 'green',
};

const emptyForm = { supplierId: '', purchaseOrderId: '', reason: 'Defective Goods' as SupplierClaimReason, description: '', amountClaimed: '', notes: '' };

export function SupplierClaims() {
  const [claims, setClaims] = useState<SupplierClaim[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const [settleTarget, setSettleTarget] = useState<SupplierClaim | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMethod, setSettleMethod] = useState<SettlementMethod>('Bank Transfer');
  const [settling, setSettling] = useState(false);

  const loadClaims = () => {
    setLoading(true);
    api
      .get<{ claims: SupplierClaim[] }>('/supplier-claims')
      .then(({ claims }) => setClaims(claims))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load supplier claims'))
      .finally(() => setLoading(false));
  };

  useEffect(loadClaims, []);
  useEffect(() => {
    api.get<{ suppliers: Supplier[] }>('/suppliers').then(({ suppliers }) => setSuppliers(suppliers)).catch(() => setSuppliers([]));
    api.get<{ purchaseOrders: PurchaseOrder[] }>('/purchase-orders').then(({ purchaseOrders }) => setOrders(purchaseOrders)).catch(() => setOrders([]));
  }, []);

  const ordersForSupplier = form.supplierId ? orders.filter((o) => o.supplierId === form.supplierId) : [];

  const openCreate = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(form.amountClaimed);
    if (!form.supplierId || !form.description.trim() || !amt || amt <= 0) {
      toast.error('A supplier, description, and positive amount are required');
      return;
    }
    setSaving(true);
    try {
      const { claim } = await api.post<{ claim: SupplierClaim }>('/supplier-claims', {
        supplierId: form.supplierId,
        purchaseOrderId: form.purchaseOrderId || undefined,
        reason: form.reason,
        description: form.description,
        amountClaimed: amt,
        notes: form.notes || undefined,
      });
      setClaims((prev) => [claim, ...prev]);
      toast.success(`${claim.claimNumber} logged`);
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to log supplier claim');
    } finally {
      setSaving(false);
    }
  };

  const respond = async (c: SupplierClaim, action: 'accept' | 'reject') => {
    setActingId(c.id);
    try {
      const { claim } = await api.patch<{ claim: SupplierClaim }>(`/supplier-claims/${c.id}`, { action });
      setClaims((prev) => prev.map((x) => (x.id === claim.id ? claim : x)));
      toast.success(action === 'accept' ? 'Claim accepted' : 'Claim rejected');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update claim');
    } finally {
      setActingId(null);
    }
  };

  const openSettle = (c: SupplierClaim) => {
    setSettleTarget(c);
    setSettleAmount(String(c.amountClaimed));
    setSettleMethod('Bank Transfer');
  };

  const submitSettle = async () => {
    if (!settleTarget) return;
    const amt = Number(settleAmount);
    if (!amt || amt <= 0) {
      toast.error('Enter a valid settled amount');
      return;
    }
    setSettling(true);
    try {
      const { claim } = await api.patch<{ claim: SupplierClaim }>(`/supplier-claims/${settleTarget.id}`, {
        action: 'settle',
        amountSettled: amt,
        settlementMethod: settleMethod,
      });
      setClaims((prev) => prev.map((x) => (x.id === claim.id ? claim : x)));
      toast.success(`${claim.claimNumber} settled`);
      setSettleTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to settle claim');
    } finally {
      setSettling(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Supplier Claims"
        description="Compensation or credit claims against a supplier — distinct from a Return (sending goods back) or a Complaint (a ticket)."
        action={<Button onClick={openCreate} disabled={suppliers.length === 0}><PlusIcon className="h-4 w-4" /> Log claim</Button>} />


      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      claims.length === 0 ?
      <Card><EmptyState icon={FileWarningIcon} title="No supplier claims yet" description="Log a claim when a supplier owes you money or credit for a delivery problem." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Claim</th>
                  <th className="px-5 py-3 font-bold">Supplier</th>
                  <th className="px-5 py-3 font-bold">Reason</th>
                  <th className="px-5 py-3 text-right font-bold">Claimed</th>
                  <th className="px-5 py-3 text-right font-bold">Settled</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) =>
              <tr key={c.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">{c.claimNumber}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-300">{c.supplierName}{c.poNumber && <span className="block text-xs text-text-gray dark:text-slate-500">{c.poNumber}</span>}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{c.reason}</td>
                    <td className="px-5 py-3 text-right text-navy dark:text-slate-100">{formatCurrency(c.amountClaimed)}</td>
                    <td className="px-5 py-3 text-right text-navy dark:text-slate-100">{c.amountSettled > 0 ? formatCurrency(c.amountSettled) : '—'}</td>
                    <td className="px-5 py-3"><Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge></td>
                    <td className="px-5 py-3 text-right">
                      {c.status === 'Open' &&
                  <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => respond(c, 'accept')} loading={actingId === c.id}><CheckIcon className="h-3.5 w-3.5" /> Accept</Button>
                          <Button size="sm" variant="secondary" onClick={() => respond(c, 'reject')} loading={actingId === c.id}><XIcon className="h-3.5 w-3.5" /> Reject</Button>
                        </div>
                  }
                      {c.status === 'Accepted' &&
                  <Button size="sm" onClick={() => openSettle(c)}>Settle</Button>
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
        title="Log supplier claim"
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="supplier-claim-form" type="submit" loading={saving}>Log claim</Button>
          </>
        }>
        <form id="supplier-claim-form" onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="sc-supplier">Supplier</Label>
            <Select id="sc-supplier" value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value, purchaseOrderId: '' }))}>
              <option value="">— select a supplier —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          {ordersForSupplier.length > 0 &&
          <div>
              <Label htmlFor="sc-po">Purchase order (optional)</Label>
              <Select id="sc-po" value={form.purchaseOrderId} onChange={(e) => setForm((f) => ({ ...f, purchaseOrderId: e.target.value }))}>
                <option value="">— none —</option>
                {ordersForSupplier.map((o) => <option key={o.id} value={o.id}>{o.poNumber}</option>)}
              </Select>
            </div>
          }
          <div>
            <Label htmlFor="sc-reason">Reason</Label>
            <Select id="sc-reason" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value as SupplierClaimReason }))}>
              {SUPPLIER_CLAIM_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="sc-description">Description</Label>
            <Textarea id="sc-description" required value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="sc-amount">Amount claimed</Label>
            <Input id="sc-amount" type="number" min={0} value={form.amountClaimed} onChange={(e) => setForm((f) => ({ ...f, amountClaimed: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="sc-notes">Notes (optional)</Label>
            <Textarea id="sc-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </form>
      </Modal>

      <Modal
        open={!!settleTarget}
        onClose={() => setSettleTarget(null)}
        title={settleTarget ? `Settle ${settleTarget.claimNumber}` : 'Settle claim'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setSettleTarget(null)}>Cancel</Button>
            <Button onClick={submitSettle} loading={settling}>Settle</Button>
          </>
        }>
        <div className="space-y-4">
          <div>
            <Label htmlFor="sc-settle-amount">Amount settled</Label>
            <Input id="sc-settle-amount" type="number" min={0} value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sc-settle-method">Settlement method</Label>
            <Select id="sc-settle-method" value={settleMethod} onChange={(e) => setSettleMethod(e.target.value as SettlementMethod)}>
              {SETTLEMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
            <p className="mt-1 text-xs text-text-gray dark:text-slate-400">Cash/Bank Transfer post a journal entry; Store Credit and Applied to Future Order don't move real cash today.</p>
          </div>
        </div>
      </Modal>
    </div>);

}
