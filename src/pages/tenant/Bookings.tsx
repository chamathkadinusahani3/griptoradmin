import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarIcon, PlusIcon, CopyIcon, CarIcon, WrenchIcon, ClipboardCheckIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Booking, BookingStatus } from '../../types/booking';
import { Customer } from '../../types/customer';
import { Service } from '../../types/service';
import { Technician } from '../../types/technician';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const TIME_SLOTS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
const STATUS_FILTERS: ('All' | BookingStatus)[] = ['All', 'Pending', 'Confirmed', 'Completed', 'Cancelled'];

const emptyForm = { customerId: '', serviceIds: [] as string[], vehicle: '', plate: '', date: '', timeSlot: '09:00', notes: '' };

export function Bookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'All' | BookingStatus>('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [convertTarget, setConvertTarget] = useState<Booking | null>(null);
  const [convertTechId, setConvertTechId] = useState('');
  const [converting, setConverting] = useState(false);

  const loadBookings = () => {
    api
      .get<{ bookings: Booking[] }>('/bookings')
      .then(({ bookings }) => setBookings(bookings))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load bookings'))
      .finally(() => setLoading(false));
  };

  useEffect(loadBookings, []);

  useEffect(() => {
    api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([]));
    api.get<{ services: Service[] }>('/services').then(({ services }) => setServices(services.filter((s) => s.active))).catch(() => setServices([]));
    api.get<{ technicians: Technician[] }>('/technicians').then(({ technicians }) => setTechnicians(technicians)).catch(() => setTechnicians([]));
  }, []);

  const bookingLink = user?.garageSlug ? `${window.location.origin}/book/${user.garageSlug}` : null;
  const copyLink = () => {
    if (!bookingLink) return;
    navigator.clipboard.writeText(bookingLink);
    toast.success('Link copied');
  };

  const openCreate = () => {
    setForm({ ...emptyForm, customerId: customers[0]?.id ?? '' });
    setModalOpen(true);
  };

  const toggleService = (id: string) => {
    setForm((f) => ({
      ...f,
      serviceIds: f.serviceIds.includes(id) ? f.serviceIds.filter((s) => s !== id) : [...f.serviceIds, id],
    }));
  };

  const save = async () => {
    if (!form.customerId || form.serviceIds.length === 0 || !form.vehicle.trim() || !form.date) {
      toast.error('Customer, at least one service, vehicle, and date are required');
      return;
    }
    setSaving(true);
    try {
      const { booking } = await api.post<{ booking: Booking }>('/bookings', form);
      setBookings((prev) => [booking, ...prev]);
      toast.success('Booking created');
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create booking');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (booking: Booking, status: BookingStatus) => {
    const previous = bookings;
    setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, status } : b)));
    try {
      await api.patch(`/bookings/${booking.id}`, { status });
      toast.success(`Booking ${status.toLowerCase()}`);
    } catch (err) {
      setBookings(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update booking');
    }
  };

  const openConvert = (booking: Booking) => {
    setConvertTarget(booking);
    setConvertTechId(technicians[0]?.id ?? '');
  };

  const doConvert = async () => {
    if (!convertTarget || !convertTechId) return;
    setConverting(true);
    try {
      await api.post(`/bookings/${convertTarget.id}/convert`, { technicianId: convertTechId });
      setBookings((prev) => prev.map((b) => (b.id === convertTarget.id ? { ...b, jobCardId: 'pending' } : b)));
      toast.success('Job card created');
      setConvertTarget(null);
      loadBookings();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to convert booking');
    } finally {
      setConverting(false);
    }
  };

  const filtered = statusFilter === 'All' ? bookings : bookings.filter((b) => b.status === statusFilter);
  const noPrereqs = customers.length === 0 || services.length === 0;

  return (
    <div>
      <PageHeader
        title="Bookings"
        description="Appointments booked by staff or through your public booking page."
        action={
        <Button onClick={openCreate} disabled={noPrereqs} title={noPrereqs ? 'Add a customer and a service first' : undefined}>
            <PlusIcon className="h-4 w-4" /> New booking
          </Button>
        } />


      {bookingLink &&
      <Card className="mb-6">
          <CardHeader title="Your public booking link" subtitle="Share this with customers so they can book themselves" />
          <div className="flex items-center gap-2 p-5 pt-0">
            <p className="flex-1 truncate rounded-xl bg-soft-gray px-3 py-2 text-sm text-navy dark:bg-slate-800/60 dark:text-slate-200">{bookingLink}</p>
            <Button variant="secondary" onClick={copyLink}><CopyIcon className="h-4 w-4" /> Copy</Button>
          </div>
        </Card>
      }

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) =>
        <button
          key={s}
          onClick={() => setStatusFilter(s)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${statusFilter === s ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>

            {s}
          </button>
        )}
      </div>

      {loading ?
      <Card><div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div></Card> :
      filtered.length === 0 ?
      <Card><EmptyState icon={CalendarIcon} title="No bookings" description="Bookings will appear here once customers book, or you add one manually." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {filtered.map((b) =>
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-navy dark:text-slate-100">{b.customer}</p>
                    <StatusBadge status={b.status} />
                    {b.source === 'public' && <Badge tone="teal">Online</Badge>}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-gray dark:text-slate-400">
                    <span className="flex items-center gap-1"><CarIcon className="h-3 w-3" /> {b.vehicle}{b.plate ? ` · ${b.plate}` : ''}</span>
                    <span className="flex items-center gap-1"><CalendarIcon className="h-3 w-3" /> {formatDate(b.date)} · {b.timeSlot}</span>
                  </p>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{(b.services ?? []).join(', ')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {b.status === 'Pending' && <Button size="sm" variant="secondary" onClick={() => setStatus(b, 'Confirmed')}>Confirm</Button>}
                  {b.status === 'Confirmed' && <Button size="sm" variant="secondary" onClick={() => setStatus(b, 'Completed')}>Complete</Button>}
                  {(b.status === 'Pending' || b.status === 'Confirmed') &&
              <Button size="sm" variant="ghost" onClick={() => setStatus(b, 'Cancelled')}>Cancel</Button>
              }
                  {!b.jobCardId && b.status !== 'Cancelled' &&
              <Button size="sm" variant="outline" onClick={() => openConvert(b)}>
                      <WrenchIcon className="h-3.5 w-3.5" /> Convert to job card
                    </Button>
              }
                  {b.jobCardId && <Badge tone="green"><ClipboardCheckIcon className="h-3 w-3" /> Job card created</Badge>}
                </div>
              </li>
          )}
          </ul>
        </Card>
      }

      {/* Create modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New booking"
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Create booking</Button>
          </>
        }>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="bk-customer">Customer</Label>
            <Select id="bk-customer" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="bk-vehicle">Vehicle</Label>
            <Input id="bk-vehicle" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} placeholder="2021 Toyota Camry" />
          </div>
          <div>
            <Label htmlFor="bk-plate">License plate</Label>
            <Input id="bk-plate" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="ABC-1234" />
          </div>
          <div>
            <Label htmlFor="bk-date">Date</Label>
            <Input id="bk-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="bk-time">Time</Label>
            <Select id="bk-time" value={form.timeSlot} onChange={(e) => setForm({ ...form, timeSlot: e.target.value })}>
              {TIME_SLOTS.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </div>
        </div>

        <div className="mt-4">
          <Label>Services</Label>
          <div className="flex flex-wrap gap-2">
            {services.map((s) =>
            <button
              key={s.id}
              type="button"
              onClick={() => toggleService(s.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${form.serviceIds.includes(s.id) ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>

                {s.name}
              </button>
            )}
          </div>
        </div>

        <div className="mt-4">
          <Label htmlFor="bk-notes">Notes</Label>
          <Textarea id="bk-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </Modal>

      {/* Convert to job card modal */}
      <Modal
        open={!!convertTarget}
        onClose={() => setConvertTarget(null)}
        title="Convert to job card"
        footer={
        <>
            <Button variant="secondary" onClick={() => setConvertTarget(null)}>Cancel</Button>
            <Button onClick={doConvert} loading={converting} disabled={!convertTechId}>Create job card</Button>
          </>
        }>

        <Label htmlFor="convert-tech">Assign a technician</Label>
        <Select id="convert-tech" value={convertTechId} onChange={(e) => setConvertTechId(e.target.value)}>
          {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        {technicians.length === 0 && <p className="mt-2 text-xs text-red-600">Add a technician first.</p>}
      </Modal>
    </div>);

}
