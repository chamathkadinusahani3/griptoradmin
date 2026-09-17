import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CarIcon, PlusIcon, PencilIcon, TrashIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { FleetVehicle } from '../../types/fleetVehicle';
import { Employee } from '../../types/employee';
import { api, ApiError } from '../../lib/api';

const STATUS_TONE: Record<FleetVehicle['status'], 'green' | 'gray' | 'amber'> = {
  Active: 'green',
  Inactive: 'gray',
  'In Maintenance': 'amber',
};

const emptyForm = { vehicleNumber: '', vehicleType: '', capacity: '', capacityUnit: 'cubic ft', driverId: '', fuelEfficiency: '' };

export function FleetVehicles() {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadVehicles = () => {
    setLoading(true);
    api
      .get<{ vehicles: FleetVehicle[] }>('/sf-vehicles')
      .then(({ vehicles }) => setVehicles(vehicles))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load vehicles'))
      .finally(() => setLoading(false));
  };

  useEffect(loadVehicles, []);
  useEffect(() => {
    api.get<{ employees: Employee[] }>('/employees').then(({ employees }) => setEmployees(employees.filter((e) => e.hasProfile))).catch(() => setEmployees([]));
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (v: FleetVehicle) => {
    setEditingId(v.id);
    setForm({
      vehicleNumber: v.vehicleNumber,
      vehicleType: v.vehicleType,
      capacity: v.capacity != null ? String(v.capacity) : '',
      capacityUnit: v.capacityUnit,
      driverId: v.driverId ?? '',
      fuelEfficiency: v.fuelEfficiency ? String(v.fuelEfficiency) : '',
    });
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vehicleNumber.trim() || !form.vehicleType.trim()) {
      toast.error('A vehicle number and type are required');
      return;
    }
    setSaving(true);
    const payload = {
      vehicleNumber: form.vehicleNumber.trim(),
      vehicleType: form.vehicleType.trim(),
      capacity: form.capacity ? Number(form.capacity) : undefined,
      capacityUnit: form.capacityUnit || 'cubic ft',
      driverId: form.driverId || undefined,
      fuelEfficiency: form.fuelEfficiency ? Number(form.fuelEfficiency) : undefined,
    };
    try {
      if (editingId) {
        const { vehicle } = await api.patch<{ vehicle: FleetVehicle }>(`/sf-vehicles/${editingId}`, payload);
        setVehicles((prev) => prev.map((v) => (v.id === vehicle.id ? vehicle : v)));
        toast.success('Vehicle updated');
      } else {
        const { vehicle } = await api.post<{ vehicle: FleetVehicle }>('/sf-vehicles', payload);
        setVehicles((prev) => [...prev, vehicle].sort((a, b) => a.vehicleNumber.localeCompare(b.vehicleNumber)));
        toast.success('Vehicle added');
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to ${editingId ? 'update' : 'add'} vehicle`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (v: FleetVehicle) => {
    setDeletingId(v.id);
    try {
      await api.delete(`/sf-vehicles/${v.id}`);
      setVehicles((prev) => prev.filter((x) => x.id !== v.id));
      toast.success('Vehicle removed');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove vehicle');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Fleet Vehicles"
        description="Delivery/field vehicles, their capacity, and assigned driver — used for load planning and route assignment."
        action={<Button onClick={openCreate}><PlusIcon className="h-4 w-4" /> Add vehicle</Button>} />


      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      vehicles.length === 0 ?
      <Card><EmptyState icon={CarIcon} title="No vehicles yet" description="Add a delivery vehicle to plan loads and assign routes." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Vehicle No.</th>
                  <th className="px-5 py-3 font-bold">Type</th>
                  <th className="px-5 py-3 text-right font-bold">Capacity</th>
                  <th className="px-5 py-3 text-right font-bold">Fuel eff.</th>
                  <th className="px-5 py-3 font-bold">Driver</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) =>
              <tr key={v.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">{v.vehicleNumber}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{v.vehicleType}</td>
                    <td className="px-5 py-3 text-right text-navy dark:text-slate-100">{v.capacity != null ? `${v.capacity} ${v.capacityUnit}` : '—'}</td>
                    <td className="px-5 py-3 text-right text-navy dark:text-slate-100">{v.fuelEfficiency > 0 ? `${v.fuelEfficiency} km/l` : '—'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{v.driverName ?? '—'}</td>
                    <td className="px-5 py-3"><Badge tone={STATUS_TONE[v.status]}>{v.status}</Badge></td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => openEdit(v)} aria-label={`Edit ${v.vehicleNumber}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button onClick={() => remove(v)} disabled={deletingId === v.id} aria-label={`Remove ${v.vehicleNumber}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-400">
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
        title={editingId ? 'Edit vehicle' : 'Add vehicle'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="vehicle-form" type="submit" loading={saving}>{editingId ? 'Save changes' : 'Add vehicle'}</Button>
          </>
        }>
        <form id="vehicle-form" onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="fv-number">Vehicle number</Label>
              <Input id="fv-number" required value={form.vehicleNumber} onChange={(e) => setForm((f) => ({ ...f, vehicleNumber: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="fv-type">Vehicle type</Label>
              <Input id="fv-type" required value={form.vehicleType} onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value }))} placeholder="e.g. Small Lorry" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="fv-capacity">Capacity</Label>
              <Input id="fv-capacity" type="number" min={0} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="fv-unit">Capacity unit</Label>
              <Input id="fv-unit" value={form.capacityUnit} onChange={(e) => setForm((f) => ({ ...f, capacityUnit: e.target.value }))} placeholder="cubic ft" />
            </div>
          </div>
          <div>
            <Label htmlFor="fv-fuel-eff">Fuel efficiency (km per liter, optional)</Label>
            <Input id="fv-fuel-eff" type="number" min={0} step="0.01" value={form.fuelEfficiency} onChange={(e) => setForm((f) => ({ ...f, fuelEfficiency: e.target.value }))} placeholder="e.g. 10" />
          </div>
          <div>
            <Label htmlFor="fv-driver">Assigned driver</Label>
            <Select id="fv-driver" value={form.driverId} onChange={(e) => setForm((f) => ({ ...f, driverId: e.target.value }))}>
              <option value="">— none —</option>
              {employees.map((e) => <option key={e.employeeId} value={e.employeeId}>{e.name}</option>)}
            </Select>
          </div>
        </form>
      </Modal>
    </div>);

}
