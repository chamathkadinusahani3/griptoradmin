import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { TagIcon, PlusIcon, TrashIcon, PencilIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { PriceList, PriceListOverride } from '../../types/priceList';
import { Part } from '../../types/part';
import { formatCurrency } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

interface DraftOverride {
  partId: string;
  price: string;
}

export function PriceLists() {
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [overrides, setOverrides] = useState<DraftOverride[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadPriceLists = () => {
    setLoading(true);
    api
      .get<{ priceLists: PriceList[] }>('/price-lists')
      .then(({ priceLists }) => setPriceLists(priceLists))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load price lists'))
      .finally(() => setLoading(false));
  };

  useEffect(loadPriceLists, []);
  useEffect(() => {
    api.get<{ parts: Part[] }>('/parts').then(({ parts }) => setParts(parts)).catch(() => setParts([]));
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setName('');
    setOverrides([]);
    setModalOpen(true);
  };

  const openEdit = (pl: PriceList) => {
    setEditingId(pl.id);
    setName(pl.name);
    setOverrides(pl.overrides.map((o: PriceListOverride) => ({ partId: o.partId, price: String(o.price) })));
    setModalOpen(true);
  };

  const addOverrideRow = () => {
    const firstAvailable = parts.find((p) => !overrides.some((o) => o.partId === p.id));
    if (!firstAvailable) return;
    setOverrides((prev) => [...prev, { partId: firstAvailable.id, price: String(firstAvailable.price) }]);
  };
  const updateOverrideRow = (i: number, patch: Partial<DraftOverride>) =>
    setOverrides((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  const removeOverrideRow = (i: number) => setOverrides((prev) => prev.filter((_, idx) => idx !== i));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('A name is required');
      return;
    }
    if (overrides.some((o) => !o.partId || o.price === '' || Number(o.price) < 0)) {
      toast.error('Every override row needs a part and a non-negative price');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), overrides: overrides.map((o) => ({ partId: o.partId, price: Number(o.price) })) };
      if (editingId) {
        const { priceList } = await api.patch<{ priceList: PriceList }>(`/price-lists/${editingId}`, payload);
        setPriceLists((prev) => prev.map((pl) => (pl.id === priceList.id ? priceList : pl)));
        toast.success('Price list updated');
      } else {
        const { priceList } = await api.post<{ priceList: PriceList }>('/price-lists', payload);
        setPriceLists((prev) => [...prev, priceList]);
        toast.success('Price list created');
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save price list');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (pl: PriceList) => {
    setDeletingId(pl.id);
    try {
      await api.delete(`/price-lists/${pl.id}`);
      setPriceLists((prev) => prev.filter((x) => x.id !== pl.id));
      toast.success('Price list deleted');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete price list');
    } finally {
      setDeletingId(null);
    }
  };

  const partsAvailableForNewRow = parts.some((p) => !overrides.some((o) => o.partId === p.id));

  return (
    <div>
      <PageHeader
        title="Price Lists"
        description="Per-part price overrides a customer can be assigned to (Settings → Enable price lists, then Customers → Default price list). Sales orders use these prices instead of the catalog price."
        action={<Button onClick={openCreate} disabled={parts.length === 0}><PlusIcon className="h-4 w-4" /> New price list</Button>} />

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={4} /></div></Card> :
      priceLists.length === 0 ?
      <Card><EmptyState icon={TagIcon} title="No price lists yet" description="Create a price list, add per-part overrides, then assign it to a customer." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Name</th>
                  <th className="px-5 py-3 font-bold">Overrides</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {priceLists.map((pl) =>
              <tr key={pl.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">{pl.name}</td>
                    <td className="px-5 py-3">
                      <Badge tone="blue">{pl.overrides.length} part{pl.overrides.length === 1 ? '' : 's'}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(pl)}><PencilIcon className="h-3.5 w-3.5" /> Edit</Button>
                        <Button size="sm" variant="ghost" loading={deletingId === pl.id} onClick={() => remove(pl)}><TrashIcon className="h-3.5 w-3.5" /> Delete</Button>
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
        title={editingId ? 'Edit price list' : 'New price list'}
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="price-list-form" type="submit" loading={saving}>{editingId ? 'Save changes' : 'Create price list'}</Button>
          </>
        }>
        <form id="price-list-form" onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="pl-name">Name</Label>
            <Input id="pl-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wholesale, Dealer Tier 1" />
          </div>
          <div>
            <Label>Part overrides</Label>
            <div className="overflow-x-auto rounded-xl border border-border-soft dark:border-slate-800">
              <table className="w-full min-w-[500px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border-soft bg-soft-gray text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-800/50">
                    <th className="px-3 py-2 font-bold">Part</th>
                    <th className="px-3 py-2 font-bold">Catalog price</th>
                    <th className="px-3 py-2 font-bold">Override price</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {overrides.map((o, i) => {
                    const part = parts.find((p) => p.id === o.partId);
                    return (
                      <tr key={i} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                        <td className="min-w-[180px] px-3 py-2">
                          <Select value={o.partId} onChange={(e) => updateOverrideRow(i, { partId: e.target.value })}>
                            {parts
                              .filter((p) => p.id === o.partId || !overrides.some((ov) => ov.partId === p.id))
                              .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </Select>
                        </td>
                        <td className="px-3 py-2 text-xs text-text-gray dark:text-slate-400">{part ? formatCurrency(part.price) : '—'}</td>
                        <td className="min-w-[110px] px-3 py-2">
                          <Input type="number" min={0} value={o.price} onChange={(e) => updateOverrideRow(i, { price: e.target.value })} />
                        </td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => removeOverrideRow(i)} className="flex items-center justify-center rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40">
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>);
                  })}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={addOverrideRow} disabled={!partsAvailableForNewRow} className="mt-2 flex items-center gap-1 text-xs font-semibold text-royal hover:underline disabled:opacity-50 dark:text-blue-300">
              <PlusIcon className="h-3.5 w-3.5" /> Add part override
            </button>
          </div>
        </form>
      </Modal>
    </div>);
}
