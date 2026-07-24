import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MailIcon, TruckIcon, PlusIcon, PackageCheckIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { Supplier } from '../../types/supplier';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const emptyForm = { name: '', contact: '', email: '' };

export function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadSuppliers = () => {
    setLoading(true);
    api
      .get<{ suppliers: Supplier[] }>('/suppliers')
      .then(({ suppliers }) => setSuppliers(suppliers))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load suppliers'))
      .finally(() => setLoading(false));
  };

  useEffect(loadSuppliers, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/suppliers', form);
      toast.success(`${form.name} added`);
      setAddOpen(false);
      setForm(emptyForm);
      loadSuppliers();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add supplier');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Manage suppliers and purchase orders."
        action={<Button onClick={() => setAddOpen(true)}><PlusIcon className="h-4 w-4" /> Add supplier</Button>} />


      {loading ?
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CardSkeleton /><CardSkeleton />
        </div> :
      suppliers.length === 0 ?
      <Card><EmptyState icon={TruckIcon} title="No suppliers yet" description="Add a supplier to start tracking parts and orders." /></Card> :

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {suppliers.map((s) =>
        <Card key={s.id} className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-light-blue text-teal dark:bg-teal/15">
                <TruckIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-navy dark:text-slate-100">{s.name}</p>
                {s.email &&
              <a href={`mailto:${s.email}`} className="flex items-center gap-1 truncate text-sm text-royal hover:underline dark:text-blue-300">
                    <MailIcon className="h-3.5 w-3.5" /> {s.email}
                  </a>
              }
              </div>
              {s.openOrders > 0 ?
            <Badge tone="amber" dot>{s.openOrders} open</Badge> :

            <Badge tone="green" dot>All clear</Badge>
            }
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-soft-gray p-3 dark:bg-slate-800/60">
                <p className="text-xs font-semibold text-text-gray dark:text-slate-400">Contact</p>
                <p className="mt-0.5 truncate text-sm font-bold text-navy dark:text-slate-100">{s.contact || '—'}</p>
              </div>
              <div className="rounded-xl bg-soft-gray p-3 dark:bg-slate-800/60">
                <p className="text-xs font-semibold text-text-gray dark:text-slate-400">Last order</p>
                <p className="mt-0.5 text-sm font-bold text-navy dark:text-slate-100">{s.lastOrder ? formatDate(s.lastOrder) : '—'}</p>
              </div>
              <div className="rounded-xl bg-soft-gray p-3 dark:bg-slate-800/60">
                <p className="flex items-center justify-center gap-1 text-xs font-semibold text-text-gray dark:text-slate-400"><PackageCheckIcon className="h-3 w-3" /> On-time</p>
                <p className="mt-0.5 text-sm font-bold text-navy dark:text-slate-100">{s.onTime != null ? `${s.onTime}%` : '—'}</p>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => toast.success(`Order placed with ${s.name}`)}>Reorder</Button>
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => toast(`Viewing orders for ${s.name}`)}>View orders</Button>
            </div>
          </Card>
        )}
      </div>
      }

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add supplier"
        footer={
        <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button form="add-supplier-form" type="submit" loading={saving}>Add supplier</Button>
          </>
        }>
        <form id="add-supplier-form" onSubmit={handleAdd} className="space-y-4">
          <div>
            <Label htmlFor="sup-name">Supplier name</Label>
            <Input id="sup-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="sup-contact">Contact person</Label>
            <Input id="sup-contact" value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="sup-email">Email</Label>
            <Input id="sup-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>);

}
