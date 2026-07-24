import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SearchIcon, BoxesIcon, ScanBarcodeIcon, AlertTriangleIcon, PlusIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Input, Select, Label } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { Part } from '../../types/part';
import { Supplier } from '../../types/supplier';
import { Branch } from '../../types/branch';
import { formatCurrency, cn } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const emptyForm = { name: '', sku: '', barcode: '', category: '', stock: '0', reorderAt: '0', price: '0', supplierId: '', branchId: '' };

export function Inventory() {
  const [parts, setParts] = useState<Part[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchFilter, setBranchFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadParts = () => {
    setLoading(true);
    api
      .get<{ parts: Part[] }>(`/parts${branchFilter ? `?branchId=${branchFilter}` : ''}`)
      .then(({ parts }) => setParts(parts))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load inventory'))
      .finally(() => setLoading(false));
  };

  useEffect(loadParts, [branchFilter]);

  useEffect(() => {
    api.get<{ suppliers: Supplier[] }>('/suppliers').then(({ suppliers }) => setSuppliers(suppliers)).catch(() => setSuppliers([]));
    api.get<{ branches: Branch[] }>('/branches').then(({ branches }) => setBranches(branches)).catch(() => setBranches([]));
  }, []);

  const categories = ['All', ...Array.from(new Set(parts.map((p) => p.category)))];

  const filtered = useMemo(
    () =>
    parts.filter((p) => {
      const q = query.toLowerCase();
      const matchQ = p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q) || (p.barcode ?? '').includes(q);
      const matchC = category === 'All' || p.category === category;
      return matchQ && matchC;
    }),
    [parts, query, category]
  );

  const lowCount = parts.filter((p) => p.stock <= p.reorderAt).length;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/parts', {
        name: form.name,
        sku: form.sku,
        barcode: form.barcode,
        category: form.category,
        stock: Number(form.stock) || 0,
        reorderAt: Number(form.reorderAt) || 0,
        price: Number(form.price) || 0,
        supplierId: form.supplierId || undefined,
        branchId: form.branchId || undefined,
      });
      toast.success('Part added to inventory');
      setAddOpen(false);
      setForm(emptyForm);
      loadParts();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add part');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Inventory"
        description={`${parts.length} parts in stock · ${lowCount} need reordering`}
        action={<Button onClick={() => setAddOpen(true)}><PlusIcon className="h-4 w-4" /> Add part</Button>} />


      {branches.length > 1 &&
      <div className="mb-4 max-w-xs">
          <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </div>
      }

      <Card>
        <div className="flex flex-col gap-3 border-b border-border-soft p-4 dark:border-slate-800 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input icon={SearchIcon} placeholder="Search by name, SKU or barcode…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search parts" />
          </div>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-44" aria-label="Filter by category">
            {categories.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </div>

        {loading ?
        <div className="p-5"><TableSkeleton rows={6} /></div> :
        filtered.length === 0 ?
        <EmptyState icon={BoxesIcon} title="No parts found" description="Try a different search or category." /> :

        <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Part</th>
                  <th className="px-5 py-3 font-bold">Barcode</th>
                  <th className="px-5 py-3 font-bold">Category</th>
                  <th className="px-5 py-3 font-bold">Supplier</th>
                  <th className="px-5 py-3 text-center font-bold">Stock</th>
                  <th className="px-5 py-3 text-right font-bold">Price</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                const low = p.stock <= p.reorderAt;
                return (
                  <tr key={p.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                      <td className="px-5 py-3">
                        <p className="font-bold text-navy dark:text-slate-100">{p.name}</p>
                        <p className="text-xs text-text-gray dark:text-slate-400">{p.sku}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-1.5 font-mono text-xs text-text-gray dark:text-slate-400">
                          <ScanBarcodeIcon className="h-3.5 w-3.5" /> {p.barcode}
                        </span>
                      </td>
                      <td className="px-5 py-3"><Badge tone="gray">{p.category}</Badge></td>
                      <td className="px-5 py-3 text-text-gray dark:text-slate-300">{p.supplier || '—'}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold', low ? 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300')}>
                          {low && <AlertTriangleIcon className="h-3 w-3" />} {p.stock}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-navy dark:text-slate-100">{formatCurrency(p.price)}</td>
                    </tr>);

              })}
              </tbody>
            </table>
          </div>
        }
      </Card>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add part"
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button form="add-part-form" type="submit" loading={saving}>Add part</Button>
          </>
        }>
        <form id="add-part-form" onSubmit={handleAdd} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="p-name">Part name</Label>
            <Input id="p-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="p-category">Category</Label>
            <Input id="p-category" required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Brakes" />
          </div>
          <div>
            <Label htmlFor="p-sku">SKU</Label>
            <Input id="p-sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="p-barcode">Barcode</Label>
            <Input id="p-barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="p-stock">Stock</Label>
            <Input id="p-stock" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="p-reorder">Reorder at</Label>
            <Input id="p-reorder" type="number" value={form.reorderAt} onChange={(e) => setForm({ ...form, reorderAt: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="p-price">Price ($)</Label>
            <Input id="p-price" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="p-supplier">Supplier</Label>
            <Select id="p-supplier" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
              <option value="">— none —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          {branches.length > 0 &&
          <div>
              <Label htmlFor="p-branch">Branch (optional)</Label>
              <Select id="p-branch" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                <option value="">— unassigned —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
          }
        </form>
      </Modal>
    </div>);

}
