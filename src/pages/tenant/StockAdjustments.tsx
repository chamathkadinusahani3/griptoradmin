import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SlidersHorizontalIcon, PlusIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { StockAdjustment, StockAdjustmentReason } from '../../types/stockAdjustment';
import { Part } from '../../types/part';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const REASONS: StockAdjustmentReason[] = ['Damage', 'Loss', 'Theft', 'Correction', 'Found', 'Other'];
const emptyForm = { partId: '', direction: 'decrease' as 'increase' | 'decrease', quantity: '', reason: 'Damage' as StockAdjustmentReason, notes: '' };

export function StockAdjustments() {
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadAdjustments = () => {
    setLoading(true);
    api
      .get<{ adjustments: StockAdjustment[] }>('/stock-adjustments')
      .then(({ adjustments }) => setAdjustments(adjustments))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load stock adjustments'))
      .finally(() => setLoading(false));
  };

  useEffect(loadAdjustments, []);
  useEffect(() => {
    api.get<{ parts: Part[] }>('/parts').then(({ parts }) => setParts(parts)).catch(() => setParts([]));
  }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(form.quantity);
    if (!form.partId || !qty || qty <= 0) {
      toast.error('A part and a positive quantity are required');
      return;
    }
    setSaving(true);
    try {
      const delta = form.direction === 'increase' ? qty : -qty;
      const { adjustment } = await api.post<{ adjustment: StockAdjustment }>('/stock-adjustments', {
        partId: form.partId,
        delta,
        reason: form.reason,
        notes: form.notes || undefined,
      });
      setAdjustments((prev) => [adjustment, ...prev]);
      toast.success('Adjustment recorded');
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record adjustment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Stock Adjustments"
        description="A manual audit trail for stock changes that aren't a sale, purchase, or transfer — damage, loss, theft, or a correction."
        action={<Button onClick={openCreate} disabled={parts.length === 0}><PlusIcon className="h-4 w-4" /> New adjustment</Button>} />


      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      adjustments.length === 0 ?
      <Card><EmptyState icon={SlidersHorizontalIcon} title="No adjustments yet" description="Manual stock corrections will show up here." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Date</th>
                  <th className="px-5 py-3 font-bold">Part</th>
                  <th className="px-5 py-3 font-bold">Reason</th>
                  <th className="px-5 py-3 text-right font-bold">Change</th>
                  <th className="px-5 py-3 text-right font-bold">New stock</th>
                  <th className="px-5 py-3 font-bold">Notes</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((a) =>
              <tr key={a.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(a.createdAt)}</td>
                    <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{a.partName ?? '—'}</td>
                    <td className="px-5 py-3"><Badge tone="gray">{a.reason}</Badge></td>
                    <td className={`px-5 py-3 text-right font-bold ${a.delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {a.delta > 0 ? `+${a.delta}` : a.delta}
                    </td>
                    <td className="px-5 py-3 text-right text-text-gray dark:text-slate-400">{a.newStock}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{a.notes ?? '—'}</td>
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
        title="New stock adjustment"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="stock-adjustment-form" type="submit" loading={saving}>Record adjustment</Button>
          </>
        }>
        <form id="stock-adjustment-form" onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="sa-part">Part</Label>
            <Select id="sa-part" value={form.partId} onChange={(e) => setForm((f) => ({ ...f, partId: e.target.value }))}>
              <option value="">— select a part —</option>
              {parts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock} in stock)</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sa-direction">Direction</Label>
              <Select id="sa-direction" value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value as 'increase' | 'decrease' }))}>
                <option value="decrease">Decrease stock</option>
                <option value="increase">Increase stock</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="sa-qty">Quantity</Label>
              <Input id="sa-qty" type="number" min={1} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="sa-reason">Reason</Label>
            <Select id="sa-reason" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value as StockAdjustmentReason }))}>
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="sa-notes">Notes (optional)</Label>
            <Textarea id="sa-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>);

}
