import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PercentIcon, PlusIcon, TrashIcon, PencilIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Toggle } from '../../components/ui/Toggle';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { Promotion, PromotionDiscountType } from '../../types/promotion';
import { Part } from '../../types/part';
import { Branch } from '../../types/branch';
import { CustomerType } from '../../types/customer';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const CUSTOMER_TYPE_OPTIONS: { value: CustomerType; label: string }[] = [
  { value: 'individual', label: 'Individual' },
  { value: 'retail', label: 'Retail' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'wholesale', label: 'Wholesale' },
  { value: 'dealer', label: 'Dealer' },
];

const emptyForm = {
  name: '',
  startDate: '',
  endDate: '',
  discountType: 'percent' as PromotionDiscountType,
  discountValue: '',
  minQty: '',
  minOrderValue: '',
  partIds: [] as string[],
  customerTypes: [] as string[],
  branchIds: [] as string[],
};

function toggleInArray(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export function Promotions() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadPromotions = () => {
    setLoading(true);
    api
      .get<{ promotions: Promotion[] }>('/promotions')
      .then(({ promotions }) => setPromotions(promotions))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load promotions'))
      .finally(() => setLoading(false));
  };

  useEffect(loadPromotions, []);
  useEffect(() => {
    api.get<{ parts: Part[] }>('/parts').then(({ parts }) => setParts(parts)).catch(() => setParts([]));
    api.get<{ branches: Branch[] }>('/branches').then(({ branches }) => setBranches(branches)).catch(() => setBranches([]));
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (p: Promotion) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      startDate: p.startDate.slice(0, 10),
      endDate: p.endDate.slice(0, 10),
      discountType: p.discountType,
      discountValue: String(p.discountValue),
      minQty: p.minQty ? String(p.minQty) : '',
      minOrderValue: p.minOrderValue ? String(p.minOrderValue) : '',
      partIds: p.partIds,
      customerTypes: p.customerTypes,
      branchIds: p.branchIds,
    });
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.startDate || !form.endDate || !form.discountValue) {
      toast.error('Name, date range, and a discount value are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minQty: form.minQty ? Number(form.minQty) : undefined,
        minOrderValue: form.minOrderValue ? Number(form.minOrderValue) : undefined,
        partIds: form.partIds,
        customerTypes: form.customerTypes,
        branchIds: form.branchIds,
      };
      if (editingId) {
        const { promotion } = await api.patch<{ promotion: Promotion }>(`/promotions/${editingId}`, payload);
        setPromotions((prev) => prev.map((p) => (p.id === promotion.id ? promotion : p)));
        toast.success('Promotion updated');
      } else {
        const { promotion } = await api.post<{ promotion: Promotion }>('/promotions', payload);
        setPromotions((prev) => [promotion, ...prev]);
        toast.success('Promotion created');
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save promotion');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: Promotion) => {
    setTogglingId(p.id);
    try {
      const { promotion } = await api.patch<{ promotion: Promotion }>(`/promotions/${p.id}`, { active: !p.active });
      setPromotions((prev) => prev.map((x) => (x.id === promotion.id ? promotion : x)));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update promotion');
    } finally {
      setTogglingId(null);
    }
  };

  const remove = async (p: Promotion) => {
    setDeletingId(p.id);
    try {
      await api.delete(`/promotions/${p.id}`);
      setPromotions((prev) => prev.filter((x) => x.id !== p.id));
      toast.success('Promotion deleted');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete promotion');
    } finally {
      setDeletingId(null);
    }
  };

  const describeDiscount = (p: Promotion) => (p.discountType === 'percent' ? `${p.discountValue}% off` : `${p.discountValue} off`);

  return (
    <div>
      <PageHeader
        title="Promotions"
        description="Auto-applies at Sales Order and POS checkout line-adding time — a matching promotion is the best deal that qualifies, no stacking with other promotions or with a manually-entered discount."
        action={<Button onClick={openCreate}><PlusIcon className="h-4 w-4" /> New promotion</Button>} />

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={4} /></div></Card> :
      promotions.length === 0 ?
      <Card><EmptyState icon={PercentIcon} title="No promotions yet" description="Create a date-bound discount that auto-applies to matching Sales Order or POS lines." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Name</th>
                  <th className="px-5 py-3 font-bold">Discount</th>
                  <th className="px-5 py-3 font-bold">Window</th>
                  <th className="px-5 py-3 font-bold">Scope</th>
                  <th className="px-5 py-3 font-bold">Active</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {promotions.map((p) =>
              <tr key={p.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">{p.name}</td>
                    <td className="px-5 py-3"><Badge tone="teal">{describeDiscount(p)}</Badge></td>
                    <td className="px-5 py-3 text-xs text-text-gray dark:text-slate-400">{formatDate(p.startDate)} – {formatDate(p.endDate)}</td>
                    <td className="px-5 py-3 text-xs text-text-gray dark:text-slate-400">
                      {p.partIds.length === 0 && p.customerTypes.length === 0 && p.branchIds.length === 0 ?
                    'Everything' :
                    [
                    p.partIds.length > 0 ? `${p.partIds.length} part${p.partIds.length === 1 ? '' : 's'}` : null,
                    p.customerTypes.length > 0 ? p.customerTypes.join(', ') : null,
                    p.branchIds.length > 0 ? `${p.branchIds.length} branch${p.branchIds.length === 1 ? '' : 'es'}` : null].
                    filter(Boolean).join(' · ')}
                    </td>
                    <td className="px-5 py-3">
                      <Toggle checked={p.active} disabled={togglingId === p.id} onChange={() => toggleActive(p)} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(p)}><PencilIcon className="h-3.5 w-3.5" /> Edit</Button>
                        <Button size="sm" variant="ghost" loading={deletingId === p.id} onClick={() => remove(p)}><TrashIcon className="h-3.5 w-3.5" /> Delete</Button>
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
        title={editingId ? 'Edit promotion' : 'New promotion'}
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="promotion-form" type="submit" loading={saving}>{editingId ? 'Save changes' : 'Create promotion'}</Button>
          </>
        }>
        <form id="promotion-form" onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="promo-name">Name</Label>
            <Input id="promo-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Monsoon Battery Sale" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="promo-start">Start date</Label>
              <Input id="promo-start" type="date" required value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="promo-end">End date</Label>
              <Input id="promo-end" type="date" required value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="promo-discount-value">Discount</Label>
              <div className="flex gap-1">
                <Input id="promo-discount-value" type="number" min={0} required value={form.discountValue} onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))} />
                <Select className="w-24" value={form.discountType} onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value as PromotionDiscountType }))}>
                  <option value="percent">%</option>
                  <option value="amount">Rs</option>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="promo-min-qty">Min qty (optional)</Label>
              <Input id="promo-min-qty" type="number" min={0} value={form.minQty} onChange={(e) => setForm((f) => ({ ...f, minQty: e.target.value }))} placeholder="No minimum" />
            </div>
          </div>
          <div>
            <Label htmlFor="promo-min-order">Min order value (optional)</Label>
            <Input id="promo-min-order" type="number" min={0} value={form.minOrderValue} onChange={(e) => setForm((f) => ({ ...f, minOrderValue: e.target.value }))} placeholder="No minimum" />
          </div>

          <div>
            <Label>Applicable parts (none selected = all parts)</Label>
            <div className="max-h-40 overflow-y-auto rounded-xl border border-border-soft p-2 dark:border-slate-800">
              {parts.length === 0 ?
              <p className="p-2 text-xs text-text-gray dark:text-slate-400">No parts in the catalog yet.</p> :

              parts.map((part) =>
              <label key={part.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-soft-gray dark:hover:bg-slate-800/60">
                    <input type="checkbox" checked={form.partIds.includes(part.id)} onChange={() => setForm((f) => ({ ...f, partIds: toggleInArray(f.partIds, part.id) }))} />
                    {part.name}
                  </label>
              )
              }
            </div>
          </div>

          <div>
            <Label>Applicable customer types (none selected = all types, and POS which has no customer)</Label>
            <div className="flex flex-wrap gap-3 rounded-xl border border-border-soft p-3 dark:border-slate-800">
              {CUSTOMER_TYPE_OPTIONS.map((opt) =>
              <label key={opt.value} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={form.customerTypes.includes(opt.value)} onChange={() => setForm((f) => ({ ...f, customerTypes: toggleInArray(f.customerTypes, opt.value) }))} />
                  {opt.label}
                </label>
              )}
            </div>
          </div>

          {branches.length > 0 &&
          <div>
              <Label>Applicable branches (none selected = all branches)</Label>
              <div className="flex flex-wrap gap-3 rounded-xl border border-border-soft p-3 dark:border-slate-800">
                {branches.map((b) =>
              <label key={b.id} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={form.branchIds.includes(b.id)} onChange={() => setForm((f) => ({ ...f, branchIds: toggleInArray(f.branchIds, b.id) }))} />
                    {b.name}
                  </label>
              )}
              </div>
            </div>
          }
        </form>
      </Modal>
    </div>);
}
