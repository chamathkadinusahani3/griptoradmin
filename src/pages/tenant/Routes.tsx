import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RouteIcon, PlusIcon, PencilIcon, TrashIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { DeliveryRoute } from '../../types/route';
import { Salesperson } from '../../types/salesperson';
import { Employee } from '../../types/employee';
import { api, ApiError } from '../../lib/api';

const emptyForm = { code: '', name: '', territory: '', towns: '', postalCodes: '', salespersonId: '', driverId: '' };

export function Routes() {
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [salespersons, setSalespersons] = useState<Salesperson[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadRoutes = () => {
    setLoading(true);
    api
      .get<{ routes: DeliveryRoute[] }>('/sf-routes')
      .then(({ routes }) => setRoutes(routes))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load routes'))
      .finally(() => setLoading(false));
  };

  useEffect(loadRoutes, []);
  useEffect(() => {
    api.get<{ salespersons: Salesperson[] }>('/salespersons').then(({ salespersons }) => setSalespersons(salespersons)).catch(() => setSalespersons([]));
    api.get<{ employees: Employee[] }>('/employees').then(({ employees }) => setEmployees(employees.filter((e) => e.hasProfile))).catch(() => setEmployees([]));
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (r: DeliveryRoute) => {
    setEditingId(r.id);
    setForm({
      code: r.code,
      name: r.name,
      territory: r.territory ?? '',
      towns: r.towns.join(', '),
      postalCodes: r.postalCodes.join(', '),
      salespersonId: r.salespersonId ?? '',
      driverId: r.driverId ?? '',
    });
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('A code and name are required');
      return;
    }
    setSaving(true);
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      territory: form.territory || undefined,
      towns: form.towns.split(',').map((t) => t.trim()).filter(Boolean),
      postalCodes: form.postalCodes.split(',').map((p) => p.trim()).filter(Boolean),
      salespersonId: form.salespersonId || undefined,
      driverId: form.driverId || undefined,
    };
    try {
      if (editingId) {
        const { route } = await api.patch<{ route: DeliveryRoute }>(`/sf-routes/${editingId}`, payload);
        setRoutes((prev) => prev.map((r) => (r.id === route.id ? route : r)));
        toast.success('Route updated');
      } else {
        const { route } = await api.post<{ route: DeliveryRoute }>('/sf-routes', payload);
        setRoutes((prev) => [...prev, route].sort((a, b) => a.code.localeCompare(b.code)));
        toast.success('Route added');
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to ${editingId ? 'update' : 'add'} route`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: DeliveryRoute) => {
    setDeletingId(r.id);
    try {
      await api.delete(`/sf-routes/${r.id}`);
      setRoutes((prev) => prev.filter((x) => x.id !== r.id));
      toast.success('Route removed');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove route');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Routes"
        description="Delivery/sales routes grouping towns and postal codes, with an assigned salesperson and driver."
        action={<Button onClick={openCreate}><PlusIcon className="h-4 w-4" /> Add route</Button>} />


      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      routes.length === 0 ?
      <Card><EmptyState icon={RouteIcon} title="No routes yet" description="Add a route to group towns/areas and assign a salesperson or driver to it." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Code</th>
                  <th className="px-5 py-3 font-bold">Name</th>
                  <th className="px-5 py-3 font-bold">Towns / Areas</th>
                  <th className="px-5 py-3 font-bold">Salesperson</th>
                  <th className="px-5 py-3 font-bold">Driver</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r) =>
              <tr key={r.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">{r.code}</td>
                    <td className="px-5 py-3 text-navy dark:text-slate-100">
                      {r.name}
                      {r.territory && <span className="block text-xs text-text-gray dark:text-slate-500">{r.territory}</span>}
                    </td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{r.towns.length > 0 ? r.towns.join(', ') : '—'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{r.salespersonName ?? '—'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{r.driverName ?? '—'}</td>
                    <td className="px-5 py-3"><Badge tone={r.status === 'Active' ? 'green' : 'gray'}>{r.status}</Badge></td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => openEdit(r)} aria-label={`Edit ${r.name}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button onClick={() => remove(r)} disabled={deletingId === r.id} aria-label={`Remove ${r.name}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-400">
                          <TrashIcon className="h-4 w-4" />
                        </button>
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
        title={editingId ? 'Edit route' : 'Add route'}
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="route-form" type="submit" loading={saving}>{editingId ? 'Save changes' : 'Add route'}</Button>
          </>
        }>
        <form id="route-form" onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rt-code">Route code</Label>
              <Input id="rt-code" required value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="rt-name">Route name</Label>
              <Input id="rt-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="rt-territory">Territory</Label>
            <Input id="rt-territory" value={form.territory} onChange={(e) => setForm((f) => ({ ...f, territory: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rt-towns">Towns / Areas (comma-separated)</Label>
              <Input id="rt-towns" value={form.towns} onChange={(e) => setForm((f) => ({ ...f, towns: e.target.value }))} placeholder="Main Town, Central Area" />
            </div>
            <div>
              <Label htmlFor="rt-postal">Postal codes (comma-separated)</Label>
              <Input id="rt-postal" value={form.postalCodes} onChange={(e) => setForm((f) => ({ ...f, postalCodes: e.target.value }))} placeholder="10100, 10200" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rt-salesperson">Assigned salesperson</Label>
              <Select id="rt-salesperson" value={form.salespersonId} onChange={(e) => setForm((f) => ({ ...f, salespersonId: e.target.value }))}>
                <option value="">— none —</option>
                {salespersons.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="rt-driver">Assigned driver</Label>
              <Select id="rt-driver" value={form.driverId} onChange={(e) => setForm((f) => ({ ...f, driverId: e.target.value }))}>
                <option value="">— none —</option>
                {employees.map((e) => <option key={e.employeeId} value={e.employeeId}>{e.name}</option>)}
              </Select>
            </div>
          </div>
        </form>
      </Modal>
    </div>);

}
