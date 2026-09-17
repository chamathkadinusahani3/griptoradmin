import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarCheckIcon, PlusIcon, LogInIcon, LogOutIcon, XIcon, CalendarClockIcon, TrashIcon, MapPinIcon, HandCoinsIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { LocationMap, LocationMapMarker } from '../../components/ui/LocationMap';
import { SalesVisit } from '../../types/salesVisit';
import { Salesperson } from '../../types/salesperson';
import { Customer } from '../../types/customer';
import { SalespersonAssignment } from '../../types/salespersonAssignment';
import { api, ApiError } from '../../lib/api';
import { CollectionModal } from './salespersons/CollectionModal';

const STATUS_TONE: Record<SalesVisit['status'], 'amber' | 'blue' | 'green' | 'red' | 'purple'> = {
  Pending: 'amber',
  'In Progress': 'blue',
  Completed: 'green',
  Cancelled: 'red',
  Rescheduled: 'purple',
};

type Tab = 'today' | 'upcoming' | 'overdue' | 'completed' | 'all';
const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: "Today's visits" },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function toDatetimeLocal(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// GPS check-in/out must never block the salesperson's workflow — if location
// access is denied, unsupported, or times out, we still let the action
// proceed without coordinates and just tell them why.
function getCurrentCoords(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      toast.warning('This browser does not support location — continuing without it.');
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const reason =
        err.code === err.PERMISSION_DENIED ? 'Location permission denied' :
        err.code === err.TIMEOUT ? 'Location request timed out' :
        'Location unavailable';
        toast.warning(`${reason} — continuing without it.`);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });
}

const emptyForm = { salespersonId: '', customerId: '', visitDate: toDatetimeLocal(), purpose: '', notes: '' };

export function SalesVisits() {
  const [visits, setVisits] = useState<SalesVisit[]>([]);
  const [salespersons, setSalespersons] = useState<Salesperson[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [assignments, setAssignments] = useState<SalespersonAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('today');

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const [rescheduleTarget, setRescheduleTarget] = useState<SalesVisit | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [locationTarget, setLocationTarget] = useState<SalesVisit | null>(null);
  const [collectionTarget, setCollectionTarget] = useState<SalesVisit | null>(null);

  const loadVisits = () => {
    setLoading(true);
    api
      .get<{ visits: SalesVisit[] }>('/sales-visits')
      .then(({ visits }) => setVisits(visits))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load visits'))
      .finally(() => setLoading(false));
  };

  useEffect(loadVisits, []);
  useEffect(() => {
    api.get<{ salespersons: Salesperson[] }>('/salespersons').then(({ salespersons }) => setSalespersons(salespersons)).catch(() => setSalespersons([]));
    api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([]));
    api.get<{ assignments: SalespersonAssignment[] }>('/salesperson-assignments').then(({ assignments }) => setAssignments(assignments)).catch(() => setAssignments([]));
  }, []);

  const assignedCustomerIds = useMemo(
    () => new Set(assignments.filter((a) => a.salespersonId === form.salespersonId && a.active).map((a) => a.customerId)),
    [assignments, form.salespersonId]
  );
  const customerOptions = form.salespersonId && assignedCustomerIds.size > 0 ? customers.filter((c) => assignedCustomerIds.has(c.id)) : customers;

  const filtered = useMemo(() => {
    const now = new Date();
    const openStatuses = new Set(['Pending', 'In Progress', 'Rescheduled']);
    return visits.filter((v) => {
      const d = new Date(v.visitDate);
      if (tab === 'today') return isSameDay(d, now);
      if (tab === 'upcoming') return d.getTime() > now.getTime() && !isSameDay(d, now) && openStatuses.has(v.status);
      if (tab === 'overdue') return d.getTime() < now.getTime() && !isSameDay(d, now) && openStatuses.has(v.status);
      if (tab === 'completed') return v.status === 'Completed';
      return true;
    });
  }, [visits, tab]);

  const openCreate = () => {
    setForm(emptyForm);
    setCreateOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.salespersonId || !form.customerId || !form.visitDate) {
      toast.error('A salesperson, customer, and visit date/time are required');
      return;
    }
    setSaving(true);
    try {
      const { visit } = await api.post<{ visit: SalesVisit }>('/sales-visits', {
        salespersonId: form.salespersonId,
        customerId: form.customerId,
        visitDate: new Date(form.visitDate).toISOString(),
        purpose: form.purpose || undefined,
        notes: form.notes || undefined,
      });
      setVisits((prev) => [visit, ...prev]);
      toast.success('Visit scheduled');
      setCreateOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to schedule visit');
    } finally {
      setSaving(false);
    }
  };

  const act = async (v: SalesVisit, action: 'checkin' | 'checkout' | 'cancel') => {
    setActingId(v.id);
    try {
      const coords = action === 'checkin' || action === 'checkout' ? await getCurrentCoords() : null;
      const { visit } = await api.patch<{ visit: SalesVisit }>(`/sales-visits/${v.id}`, {
        action,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      });
      setVisits((prev) => prev.map((x) => (x.id === visit.id ? visit : x)));
      toast.success(action === 'checkin' ? 'Checked in' : action === 'checkout' ? 'Visit completed' : 'Visit cancelled');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update visit');
    } finally {
      setActingId(null);
    }
  };

  const remove = async (v: SalesVisit) => {
    setActingId(v.id);
    try {
      await api.delete(`/sales-visits/${v.id}`);
      setVisits((prev) => prev.filter((x) => x.id !== v.id));
      toast.success('Visit removed');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove visit');
    } finally {
      setActingId(null);
    }
  };

  const openReschedule = (v: SalesVisit) => {
    setRescheduleTarget(v);
    setRescheduleDate(toDatetimeLocal(v.visitDate));
  };

  const submitReschedule = async () => {
    if (!rescheduleTarget || !rescheduleDate) return;
    setRescheduling(true);
    try {
      const { visit } = await api.patch<{ visit: SalesVisit }>(`/sales-visits/${rescheduleTarget.id}`, {
        action: 'reschedule',
        visitDate: new Date(rescheduleDate).toISOString(),
      });
      setVisits((prev) => prev.map((x) => (x.id === visit.id ? visit : x)));
      toast.success('Visit rescheduled');
      setRescheduleTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to reschedule visit');
    } finally {
      setRescheduling(false);
    }
  };

  const locationMarkers: LocationMapMarker[] = locationTarget ?
  [
  locationTarget.checkInLat != null && locationTarget.checkInLng != null ?
  { lat: locationTarget.checkInLat, lng: locationTarget.checkInLng, label: `Checked in ${locationTarget.checkInAt ? formatDateTime(locationTarget.checkInAt) : ''}` } :
  null,
  locationTarget.checkOutLat != null && locationTarget.checkOutLng != null ?
  { lat: locationTarget.checkOutLat, lng: locationTarget.checkOutLng, label: `Checked out ${locationTarget.checkOutAt ? formatDateTime(locationTarget.checkOutAt) : ''}` } :
  null].
  filter((m): m is LocationMapMarker => m !== null) :
  [];

  return (
    <div>
      <PageHeader
        title="Sales Visits"
        description="Scheduled field visits — check in/out, reschedule, or cancel."
        action={<Button onClick={openCreate} disabled={salespersons.length === 0 || customers.length === 0}><PlusIcon className="h-4 w-4" /> Schedule visit</Button>} />


      <div className="mb-6 flex flex-wrap items-center gap-2">
        {TABS.map((t) =>
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${tab === t.key ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>

            {t.label}
          </button>
        )}
      </div>

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      filtered.length === 0 ?
      <Card><EmptyState icon={CalendarCheckIcon} title="No visits here" description="Schedule a visit to start tracking field activity." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Salesperson</th>
                  <th className="px-5 py-3 font-bold">Customer</th>
                  <th className="px-5 py-3 font-bold">Date &amp; time</th>
                  <th className="px-5 py-3 font-bold">Purpose</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="sticky right-0 border-l border-border-soft bg-white px-5 py-3 text-right font-bold dark:border-slate-800 dark:bg-slate-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) =>
              <tr key={v.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{v.salespersonName ?? v.salespersonId}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{v.customerName ?? v.customerId}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDateTime(v.visitDate)}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{v.purpose || '—'}</td>
                    <td className="px-5 py-3">
                      <Badge tone={STATUS_TONE[v.status]}>{v.status}</Badge>
                      {v.status === 'Completed' && v.durationMinutes != null && <p className="mt-1 text-xs text-text-gray dark:text-slate-500">{v.durationMinutes} min</p>}
                      {v.tripDistanceKm != null &&
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-500">
                          {v.tripDistanceKm} km{v.estimatedFuelCost != null ? ` · Rs ${v.estimatedFuelCost} fuel` : ''}
                        </p>
                  }
                    </td>
                    <td className="sticky right-0 border-l border-border-soft bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {(v.checkInLat != null || v.checkOutLat != null) &&
                    <button onClick={() => setLocationTarget(v)} aria-label={`View location for visit to ${v.customerName ?? 'customer'}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">
                            <MapPinIcon className="h-4 w-4" />
                          </button>
                    }
                        {(v.status === 'Pending' || v.status === 'Rescheduled') &&
                    <>
                            <Button size="sm" variant="secondary" onClick={() => act(v, 'checkin')} loading={actingId === v.id}><LogInIcon className="h-3.5 w-3.5" /> Check in</Button>
                            <Button size="sm" variant="secondary" onClick={() => openReschedule(v)}><CalendarClockIcon className="h-3.5 w-3.5" /> Reschedule</Button>
                          </>
                    }
                        {(v.status === 'In Progress' || v.status === 'Completed') &&
                    <button onClick={() => setCollectionTarget(v)} aria-label={`Record collection for visit to ${v.customerName ?? 'customer'}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">
                            <HandCoinsIcon className="h-4 w-4" />
                          </button>
                    }
                        {v.status === 'In Progress' &&
                    <Button size="sm" onClick={() => act(v, 'checkout')} loading={actingId === v.id}><LogOutIcon className="h-3.5 w-3.5" /> Check out</Button>
                    }
                        {(v.status === 'Pending' || v.status === 'In Progress' || v.status === 'Rescheduled') &&
                    <button onClick={() => act(v, 'cancel')} disabled={actingId === v.id} aria-label={`Cancel visit to ${v.customerName ?? 'customer'}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-400">
                            <XIcon className="h-4 w-4" />
                          </button>
                    }
                        {v.status === 'Pending' &&
                    <button onClick={() => remove(v)} disabled={actingId === v.id} aria-label={`Remove visit to ${v.customerName ?? 'customer'}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-400">
                            <TrashIcon className="h-4 w-4" />
                          </button>
                    }
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
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Schedule visit"
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button form="visit-form" type="submit" loading={saving}>Schedule visit</Button>
          </>
        }>
        <form id="visit-form" onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="v-salesperson">Salesperson</Label>
              <Select id="v-salesperson" value={form.salespersonId} onChange={(e) => setForm((f) => ({ ...f, salespersonId: e.target.value, customerId: '' }))}>
                <option value="">— select —</option>
                {salespersons.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="v-customer">Customer / shop</Label>
              <Select id="v-customer" value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}>
                <option value="">— select —</option>
                {customerOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="v-date">Visit date &amp; time</Label>
            <Input id="v-date" type="datetime-local" value={form.visitDate} onChange={(e) => setForm((f) => ({ ...f, visitDate: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="v-purpose">Purpose (optional)</Label>
            <Input id="v-purpose" value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} placeholder="e.g. Order collection, product demo" />
          </div>
          <div>
            <Label htmlFor="v-notes">Notes (optional)</Label>
            <Textarea id="v-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </form>
      </Modal>

      <Modal
        open={!!rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        title={rescheduleTarget ? `Reschedule visit — ${rescheduleTarget.customerName ?? ''}` : 'Reschedule visit'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setRescheduleTarget(null)}>Cancel</Button>
            <Button onClick={submitReschedule} loading={rescheduling}>Reschedule</Button>
          </>
        }>
        <div>
          <Label htmlFor="v-reschedule-date">New date &amp; time</Label>
          <Input id="v-reschedule-date" type="datetime-local" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} />
        </div>
      </Modal>

      <Modal
        open={!!locationTarget}
        onClose={() => setLocationTarget(null)}
        title={locationTarget ? `Visit location — ${locationTarget.customerName ?? ''}` : 'Visit location'}
        size="lg">
        <LocationMap markers={locationMarkers} height="360px" />
      </Modal>

      {collectionTarget &&
      <CollectionModal
        salespersonId={collectionTarget.salespersonId}
        customerId={collectionTarget.customerId}
        customerName={collectionTarget.customerName}
        visitId={collectionTarget.id}
        onClose={() => setCollectionTarget(null)}
        onRecorded={() => setCollectionTarget(null)} />

      }
    </div>);

}
