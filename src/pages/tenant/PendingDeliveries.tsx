import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PackageSearchIcon, TruckIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { PendingDelivery, DeliveryAssignmentInfo, DELIVERY_ASSIGNMENT_STATUSES, DeliveryAssignmentStatus } from '../../types/pendingDelivery';
import { DeliveryRoute } from '../../types/route';
import { FleetVehicle } from '../../types/fleetVehicle';
import { Employee } from '../../types/employee';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const STATUS_TONE: Record<DeliveryAssignmentStatus, 'amber' | 'blue' | 'purple' | 'green' | 'red' | 'gray'> = {
  Pending: 'amber',
  Assigned: 'blue',
  'In Transit': 'purple',
  Delivered: 'green',
  Failed: 'red',
  Cancelled: 'gray',
};

export function PendingDeliveries() {
  const [deliveries, setDeliveries] = useState<PendingDelivery[]>([]);
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [assignTarget, setAssignTarget] = useState<PendingDelivery | null>(null);
  const [form, setForm] = useState({ routeId: '', driverId: '', vehicleId: '', status: 'Assigned' as DeliveryAssignmentStatus, deliveryDate: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get<{ deliveries: PendingDelivery[] }>('/pending-deliveries')
      .then(({ deliveries }) => setDeliveries(deliveries))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load pending deliveries'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    api.get<{ routes: DeliveryRoute[] }>('/sf-routes').then(({ routes }) => setRoutes(routes)).catch(() => setRoutes([]));
    api.get<{ vehicles: FleetVehicle[] }>('/sf-vehicles').then(({ vehicles }) => setVehicles(vehicles)).catch(() => setVehicles([]));
    api.get<{ employees: Employee[] }>('/employees').then(({ employees }) => setEmployees(employees.filter((e) => e.hasProfile))).catch(() => setEmployees([]));
  }, []);

  const openAssign = (d: PendingDelivery) => {
    setAssignTarget(d);
    setForm({
      routeId: d.assignment?.routeId ?? '',
      driverId: d.assignment?.driverId ?? '',
      vehicleId: d.assignment?.vehicleId ?? '',
      status: d.assignment?.status ?? 'Assigned',
      deliveryDate: d.assignment?.deliveryDate ? d.assignment.deliveryDate.slice(0, 10) : '',
      notes: d.assignment?.notes ?? '',
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTarget) return;
    setSaving(true);
    try {
      const { assignment } = await api.patch<{ assignment: DeliveryAssignmentInfo }>(`/pending-deliveries/${assignTarget.salesOrderId}`, {
        routeId: form.routeId || undefined,
        driverId: form.driverId || undefined,
        vehicleId: form.vehicleId || undefined,
        status: form.status,
        deliveryDate: form.deliveryDate || undefined,
        notes: form.notes || undefined,
      });
      setDeliveries((prev) => prev.map((d) => (d.salesOrderId === assignTarget.salesOrderId ? { ...d, assignment } : d)));
      toast.success('Delivery updated');
      setAssignTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update delivery');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Pending Deliveries"
        description="Outstanding items from confirmed Sales Orders, assignable to a route, driver, and vehicle." />


      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      deliveries.length === 0 ?
      <Card><EmptyState icon={PackageSearchIcon} title="No pending deliveries" description="Confirmed sales orders with items still outstanding will show up here." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Order</th>
                  <th className="px-5 py-3 font-bold">Customer</th>
                  <th className="px-5 py-3 font-bold">Outstanding items</th>
                  <th className="px-5 py-3 font-bold">Load</th>
                  <th className="px-5 py-3 font-bold">Route</th>
                  <th className="px-5 py-3 font-bold">Driver / Vehicle</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) =>
              <tr key={d.salesOrderId} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">
                      {d.salesOrderNumber}
                      <span className="block text-xs font-normal text-text-gray dark:text-slate-500">{formatDate(d.orderCreatedAt)}</span>
                    </td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">
                      {d.customerName ?? d.customerId}
                      {d.customerPhone && <span className="block text-xs">{d.customerPhone}</span>}
                    </td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">
                      {d.items.map((i) => `${i.name} ×${i.outstandingQuantity}`).join(', ')}
                    </td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">
                      {d.totalVolume > 0 ? `${d.totalVolume} cu ft` : '—'}
                      {d.suggestedVehicleType && <span className="block text-xs text-teal">Suggested: {d.suggestedVehicleType}</span>}
                    </td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{d.assignment?.routeName ?? '—'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">
                      {d.assignment?.driverName ?? '—'}
                      {d.assignment?.vehicleNumber && <span className="block text-xs">{d.assignment.vehicleNumber}</span>}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={STATUS_TONE[d.assignment?.status ?? 'Pending']}>{d.assignment?.status ?? 'Pending'}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="secondary" onClick={() => openAssign(d)}><TruckIcon className="h-3.5 w-3.5" /> {d.assignment ? 'Update' : 'Assign'}</Button>
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        </Card>
      }

      <Modal
        open={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        title={assignTarget ? `Assign delivery — ${assignTarget.salesOrderNumber}` : 'Assign delivery'}
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setAssignTarget(null)}>Cancel</Button>
            <Button form="assign-form" type="submit" loading={saving}>Save</Button>
          </>
        }>
        <form id="assign-form" onSubmit={save} className="space-y-4">
          {assignTarget && assignTarget.totalVolume > 0 &&
          <div className="rounded-xl border border-border-soft bg-soft-gray px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800/60">
              <span className="font-semibold text-navy dark:text-slate-100">Total delivery load: {assignTarget.totalVolume} cu ft</span>
              {assignTarget.suggestedVehicleType ?
            <span className="ml-2 text-teal">Suggested vehicle: {assignTarget.suggestedVehicleType}</span> :

            <span className="ml-2 text-text-gray dark:text-slate-400">No configured rule covers this load — check Settings.</span>
            }
            </div>
          }
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ad-route">Route</Label>
              <Select id="ad-route" value={form.routeId} onChange={(e) => setForm((f) => ({ ...f, routeId: e.target.value }))}>
                <option value="">— none —</option>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="ad-status">Status</Label>
              <Select id="ad-status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as DeliveryAssignmentStatus }))}>
                {DELIVERY_ASSIGNMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ad-driver">Driver</Label>
              <Select id="ad-driver" value={form.driverId} onChange={(e) => setForm((f) => ({ ...f, driverId: e.target.value }))}>
                <option value="">— none —</option>
                {employees.map((e) => <option key={e.employeeId} value={e.employeeId}>{e.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="ad-vehicle">Vehicle</Label>
              <Select id="ad-vehicle" value={form.vehicleId} onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))}>
                <option value="">— none —</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.vehicleNumber} ({v.vehicleType})</option>)}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="ad-date">Delivery date</Label>
            <Input id="ad-date" type="date" value={form.deliveryDate} onChange={(e) => setForm((f) => ({ ...f, deliveryDate: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="ad-notes">Notes (optional)</Label>
            <Textarea id="ad-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>);

}
