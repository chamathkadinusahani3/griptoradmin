import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { IdCardIcon, PlusIcon, PencilIcon, TrashIcon, StoreIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Toggle } from '../../components/ui/Toggle';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { Salesperson } from '../../types/salesperson';
import { Employee } from '../../types/employee';
import { DeliveryRoute } from '../../types/route';
import { api, ApiError } from '../../lib/api';
import { ShopsModal } from './salespersons/ShopsModal';

const emptyForm = { code: '', name: '', employeeId: '', mobile: '', email: '', territory: '', routeId: '', target: '', commissionPct: '', gpsTrackingEnabled: true };

export function Salespersons() {
  const [salespersons, setSalespersons] = useState<Salesperson[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [shopsFor, setShopsFor] = useState<Salesperson | null>(null);

  const loadSalespersons = () => {
    setLoading(true);
    api
      .get<{ salespersons: Salesperson[] }>('/salespersons')
      .then(({ salespersons }) => setSalespersons(salespersons))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load salespersons'))
      .finally(() => setLoading(false));
  };

  useEffect(loadSalespersons, []);
  useEffect(() => {
    api.get<{ employees: Employee[] }>('/employees').then(({ employees }) => setEmployees(employees.filter((e) => e.hasProfile))).catch(() => setEmployees([]));
    api.get<{ routes: DeliveryRoute[] }>('/sf-routes').then(({ routes }) => setRoutes(routes)).catch(() => setRoutes([]));
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (sp: Salesperson) => {
    setEditingId(sp.id);
    setForm({
      code: sp.code,
      name: sp.name,
      employeeId: sp.employeeId ?? '',
      mobile: sp.mobile ?? '',
      email: sp.email ?? '',
      territory: sp.territory ?? '',
      routeId: sp.routeId ?? '',
      target: sp.target ? String(sp.target) : '',
      commissionPct: sp.commissionPct ? String(sp.commissionPct) : '',
      gpsTrackingEnabled: sp.gpsTrackingEnabled,
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
      employeeId: form.employeeId || undefined,
      mobile: form.mobile || undefined,
      email: form.email || undefined,
      territory: form.territory || undefined,
      routeId: form.routeId || undefined,
      target: form.target ? Number(form.target) : 0,
      commissionPct: form.commissionPct ? Number(form.commissionPct) : 0,
      gpsTrackingEnabled: form.gpsTrackingEnabled,
    };
    try {
      if (editingId) {
        const { salesperson } = await api.patch<{ salesperson: Salesperson }>(`/salespersons/${editingId}`, payload);
        setSalespersons((prev) => prev.map((s) => (s.id === salesperson.id ? salesperson : s)));
        toast.success('Salesperson updated');
      } else {
        const { salesperson } = await api.post<{ salesperson: Salesperson }>('/salespersons', payload);
        setSalespersons((prev) => [...prev, salesperson].sort((a, b) => a.name.localeCompare(b.name)));
        toast.success('Salesperson added');
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to ${editingId ? 'update' : 'add'} salesperson`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (sp: Salesperson) => {
    setDeletingId(sp.id);
    try {
      await api.delete(`/salespersons/${sp.id}`);
      setSalespersons((prev) => prev.filter((s) => s.id !== sp.id));
      toast.success('Salesperson removed');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove salesperson');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleStatus = async (sp: Salesperson) => {
    setTogglingId(sp.id);
    const nextStatus = sp.status === 'Active' ? 'Inactive' : 'Active';
    try {
      const { salesperson } = await api.patch<{ salesperson: Salesperson }>(`/salespersons/${sp.id}`, { status: nextStatus });
      setSalespersons((prev) => prev.map((s) => (s.id === salesperson.id ? salesperson : s)));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update status');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Salespersons"
        description="Field sales staff, their territory, assigned route, and sales target — the base roster for Sales Force Management."
        action={<Button onClick={openCreate}><PlusIcon className="h-4 w-4" /> Add salesperson</Button>} />


      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      salespersons.length === 0 ?
      <Card><EmptyState icon={IdCardIcon} title="No salespersons yet" description="Add a salesperson to start assigning shops, routes, and sales targets." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Code</th>
                  <th className="px-5 py-3 font-bold">Name</th>
                  <th className="px-5 py-3 font-bold">Contact</th>
                  <th className="px-5 py-3 font-bold">Territory</th>
                  <th className="px-5 py-3 text-right font-bold">Target</th>
                  <th className="px-5 py-3 font-bold">GPS</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {salespersons.map((sp) =>
              <tr key={sp.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">{sp.code}</td>
                    <td className="px-5 py-3 text-navy dark:text-slate-100">
                      {sp.name}
                      {sp.employeeName && <span className="block text-xs text-text-gray dark:text-slate-500">{sp.employeeName}</span>}
                    </td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">
                      {sp.mobile && <span className="block">{sp.mobile}</span>}
                      {sp.email && <span className="block text-xs">{sp.email}</span>}
                      {!sp.mobile && !sp.email && '—'}
                    </td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">
                      {sp.territory || '—'}
                      {sp.routeName && <span className="block text-xs text-text-gray dark:text-slate-500">{sp.routeName}</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-navy dark:text-slate-100">{sp.target > 0 ? sp.target.toLocaleString() : '—'}</td>
                    <td className="px-5 py-3">
                      <Badge tone={sp.gpsTrackingEnabled ? 'green' : 'gray'}>{sp.gpsTrackingEnabled ? 'Enabled' : 'Disabled'}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <button onClick={() => toggleStatus(sp)} disabled={togglingId === sp.id} className="disabled:opacity-50">
                        <Badge tone={sp.status === 'Active' ? 'green' : 'gray'}>{sp.status}</Badge>
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => setShopsFor(sp)} aria-label={`Assigned shops for ${sp.name}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">
                          <StoreIcon className="h-4 w-4" />
                        </button>
                        <button onClick={() => openEdit(sp)} aria-label={`Edit ${sp.name}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button onClick={() => remove(sp)} disabled={deletingId === sp.id} aria-label={`Remove ${sp.name}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-400">
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
        title={editingId ? 'Edit salesperson' : 'Add salesperson'}
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="salesperson-form" type="submit" loading={saving}>{editingId ? 'Save changes' : 'Add salesperson'}</Button>
          </>
        }>
        <form id="salesperson-form" onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sp-code">Salesperson code</Label>
              <Input id="sp-code" required value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="sp-name">Name</Label>
              <Input id="sp-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
          </div>
          {employees.length > 0 &&
          <div>
              <Label htmlFor="sp-employee">Linked employee (optional)</Label>
              <Select id="sp-employee" value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}>
                <option value="">— none —</option>
                {employees.map((e) => <option key={e.employeeId} value={e.employeeId}>{e.name}</option>)}
              </Select>
            </div>
          }
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sp-mobile">Mobile</Label>
              <Input id="sp-mobile" value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="sp-email">Email</Label>
              <Input id="sp-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sp-territory">Territory / Area</Label>
              <Input id="sp-territory" value={form.territory} onChange={(e) => setForm((f) => ({ ...f, territory: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="sp-route">Assigned route</Label>
              <Select id="sp-route" value={form.routeId} onChange={(e) => setForm((f) => ({ ...f, routeId: e.target.value }))}>
                <option value="">— none —</option>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sp-target">Sales target</Label>
              <Input id="sp-target" type="number" min={0} value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="sp-commission">Commission % (optional)</Label>
              <Input id="sp-commission" type="number" min={0} max={100} value={form.commissionPct} onChange={(e) => setForm((f) => ({ ...f, commissionPct: e.target.value }))} placeholder="No commission" />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border-soft px-4 py-3 dark:border-slate-700">
            <div>
              <p className="text-sm font-semibold text-navy dark:text-slate-100">GPS / location tracking</p>
              <p className="text-xs text-text-gray dark:text-slate-400">Capture GPS coordinates on visit check-in/check-out.</p>
            </div>
            <Toggle checked={form.gpsTrackingEnabled} onChange={(next) => setForm((f) => ({ ...f, gpsTrackingEnabled: next }))} />
          </div>
        </form>
      </Modal>

      {shopsFor && <ShopsModal salesperson={shopsFor} onClose={() => setShopsFor(null)} />}
    </div>);

}
