import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { WarehouseIcon, PlusIcon, StarIcon, PencilIcon, LockIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Label, Select } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Warehouse } from '../../types/warehouse';
import { Branch } from '../../types/branch';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const emptyForm = { name: '', branchId: '' };

export function Warehouses() {
  const { user } = useAuth();
  const warehouseEnabled = user?.addOns?.includes('pos-warehouse') ?? false;
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [editName, setEditName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadWarehouses = () => {
    setLoading(true);
    api
      .get<{ warehouses: Warehouse[] }>('/warehouses')
      .then(({ warehouses }) => setWarehouses(warehouses))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load warehouses'))
      .finally(() => setLoading(false));
  };

  useEffect(loadWarehouses, []);
  useEffect(() => {
    api.get<{ branches: Branch[] }>('/branches').then(({ branches }) => setBranches(branches)).catch(() => setBranches([]));
  }, []);

  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/warehouses', { name: form.name, branchId: form.branchId || undefined });
      toast.success(`${form.name} added`);
      setAddOpen(false);
      setForm(emptyForm);
      loadWarehouses();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add warehouse');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (warehouse: Warehouse) => {
    setEditingWarehouse(warehouse);
    setEditName(warehouse.name);
  };

  const saveEdit = async () => {
    if (!editingWarehouse) return;
    setSavingEdit(true);
    try {
      const { warehouse } = await api.patch<{ warehouse: Warehouse }>(`/warehouses/${editingWarehouse.id}`, { name: editName });
      setWarehouses((prev) => prev.map((w) => (w.id === warehouse.id ? warehouse : w)));
      toast.success(`${warehouse.name} updated`);
      setEditingWarehouse(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update warehouse');
    } finally {
      setSavingEdit(false);
    }
  };

  const makeDefault = async (warehouse: Warehouse) => {
    const previous = warehouses;
    setWarehouses((prev) => prev.map((w) => ({ ...w, isDefault: w.branchId === warehouse.branchId ? w.id === warehouse.id : w.isDefault })));
    try {
      await api.patch(`/warehouses/${warehouse.id}`, { isDefault: true });
    } catch (err) {
      setWarehouses(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update warehouse');
    }
  };

  return (
    <div>
      <PageHeader
        title="Warehouses"
        description="Named stock locations — a garage's front counter shelf vs. its back storeroom, for example."
        action={<Button onClick={() => setAddOpen(true)} disabled={!warehouseEnabled}><PlusIcon className="h-4 w-4" /> Add warehouse</Button>} />


      {!warehouseEnabled &&
      <Card className="mb-6">
          <div className="flex items-center gap-3 p-5">
            <LockIcon className="h-5 w-5 text-text-gray dark:text-slate-400" />
            <div>
              <p className="font-bold text-navy dark:text-slate-100">Multi-warehouse Sync isn't enabled</p>
              <p className="text-sm text-text-gray dark:text-slate-400">Ask GRIPTOR to enable the Multi-warehouse Sync add-on to track stock across more than one location.</p>
            </div>
          </div>
        </Card>
      }

      {loading ?
      <Card><div className="space-y-3 p-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div></Card> :
      warehouses.length === 0 ?
      <Card><EmptyState icon={WarehouseIcon} title="No warehouses yet" description="Add a warehouse to start tracking stock by location and moving it between locations." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {warehouses.map((w) =>
          <li key={w.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-bold text-navy dark:text-slate-100">
                    {w.name}
                    {w.isDefault && <Badge tone="blue">Default</Badge>}
                  </p>
                  <p className="text-xs text-text-gray dark:text-slate-400">
                    {w.branchId ? branchNameById.get(w.branchId) ?? 'Unknown branch' : 'Not tied to a branch'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(w)} aria-label={`Edit ${w.name}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  {!w.isDefault &&
              <Button size="sm" variant="secondary" onClick={() => makeDefault(w)}><StarIcon className="h-3.5 w-3.5" /> Make default</Button>
              }
                </div>
              </li>
          )}
          </ul>
        </Card>
      }

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add warehouse"
        footer={
        <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button form="add-warehouse-form" type="submit" loading={saving}>Add warehouse</Button>
          </>
        }>
        <form id="add-warehouse-form" onSubmit={handleAdd} className="space-y-4">
          <div>
            <Label htmlFor="wh-name">Warehouse name</Label>
            <Input id="wh-name" required placeholder="e.g. Back storeroom" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          {branches.length > 0 &&
          <div>
              <Label htmlFor="wh-branch">Branch (optional)</Label>
              <Select id="wh-branch" value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
                <option value="">— not tied to a branch —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
          }
        </form>
      </Modal>

      <Modal
        open={!!editingWarehouse}
        onClose={() => setEditingWarehouse(null)}
        title={editingWarehouse ? `Edit ${editingWarehouse.name}` : 'Edit warehouse'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setEditingWarehouse(null)}>Cancel</Button>
            <Button loading={savingEdit} onClick={saveEdit}>Save</Button>
          </>
        }>
        <div>
          <Label htmlFor="wh-edit-name">Warehouse name</Label>
          <Input id="wh-edit-name" required value={editName} onChange={(e) => setEditName(e.target.value)} />
        </div>
      </Modal>
    </div>);

}
