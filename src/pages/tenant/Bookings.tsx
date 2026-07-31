import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarIcon,
  PlusIcon,
  CopyIcon,
  CarIcon,
  WrenchIcon,
  ClipboardCheckIcon,
  SearchIcon,
  PrinterIcon,
  DownloadIcon,
  RepeatIcon,
  ClockIcon,
  AlertTriangleIcon,
  StickyNoteIcon,
  ChevronDownIcon,
  ChevronUpIcon } from
'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StatusBadge } from '../../components/StatusBadge';
import { StatCard } from '../../components/ui/StatCard';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { Booking, BookingStatus } from '../../types/booking';
import { Customer } from '../../types/customer';
import { Service } from '../../types/service';
import { Technician } from '../../types/technician';
import { Branch } from '../../types/branch';
import { Bay } from '../../types/bay';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { CreateBookingModal, RebookPrefill } from './bookings/CreateBookingModal';
import { useLateAlerts } from './bookings/useLateAlerts';
import { useAutoRefresh } from './bookings/useAutoRefresh';

const STATUS_FILTERS: ('All' | BookingStatus)[] = ['All', 'Pending', 'Waiting', 'In Progress', 'Completed', 'Cancelled'];

// Per-target-status confirmation copy — the whole point of a confirmation
// dialog here is that "Cancel" reads differently from "Start."
const STATUS_CONFIRM_COPY: Record<BookingStatus, { title: string; body: string; confirmLabel: string; danger?: boolean }> = {
  Pending: { title: 'Move back to Pending', body: 'This booking will be marked Pending again.', confirmLabel: 'Move to Pending' },
  Waiting: { title: 'Confirm booking', body: 'The customer will be marked as confirmed and waiting to be served.', confirmLabel: 'Confirm' },
  'In Progress': { title: 'Start this booking', body: 'This marks work as underway for this booking.', confirmLabel: 'Start' },
  Completed: { title: 'Complete this booking', body: 'This marks the booking as finished.', confirmLabel: 'Complete' },
  Cancelled: { title: 'Cancel booking', body: 'The customer will need to be notified separately — this cannot be undone from here.', confirmLabel: 'Cancel Booking', danger: true },
};

const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  Pending: ['Waiting', 'In Progress', 'Cancelled'],
  Waiting: ['In Progress', 'Cancelled'],
  'In Progress': ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function Bookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [bays, setBays] = useState<Bay[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | BookingStatus>('All');
  const [branchFilter, setBranchFilter] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<'All' | 'staff' | 'public'>('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [createOpen, setCreateOpen] = useState(false);
  const [rebookPrefill, setRebookPrefill] = useState<RebookPrefill | null>(null);

  const [statusChangeTarget, setStatusChangeTarget] = useState<{ booking: Booking; nextStatus: BookingStatus } | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);

  const [bayNotesTarget, setBayNotesTarget] = useState<Booking | null>(null);
  const [bayNotesForm, setBayNotesForm] = useState({ bayId: '', notes: '' });
  const [savingBayNotes, setSavingBayNotes] = useState(false);

  const [convertTarget, setConvertTarget] = useState<Booking | null>(null);
  const [convertTechId, setConvertTechId] = useState('');
  const [converting, setConverting] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  const loadBookings = () => {
    setLoading(true);
    api
      .get<{ bookings: Booking[] }>('/bookings')
      .then(({ bookings }) => setBookings(bookings))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load bookings'))
      .finally(() => setLoading(false));
  };

  useEffect(loadBookings, []);
  useEffect(() => {
    api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([]));
    api.get<{ services: Service[] }>('/services').then(({ services }) => setServices(services)).catch(() => setServices([]));
    api.get<{ technicians: Technician[] }>('/technicians').then(({ technicians }) => setTechnicians(technicians)).catch(() => setTechnicians([]));
    api.get<{ branches: Branch[] }>('/branches').then(({ branches }) => setBranches(branches)).catch(() => setBranches([]));
    api.get<{ bays: Bay[] }>('/bays').then(({ bays }) => setBays(bays)).catch(() => setBays([]));
  }, []);

  useAutoRefresh(setBookings);

  const updateOneBooking = (updated: Booking) => setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  const { alerts: lateAlerts, dismiss: dismissLateAlert } = useLateAlerts(bookings, updateOneBooking);

  const bookingLink = user?.garageSlug ? `${window.location.origin}/book/${user.garageSlug}` : null;
  const copyLink = () => {
    if (!bookingLink) return;
    navigator.clipboard.writeText(bookingLink);
    toast.success('Link copied');
  };

  const stats = useMemo(
    () => ({
      total: bookings.length,
      pending: bookings.filter((b) => b.status === 'Pending').length,
      waiting: bookings.filter((b) => b.status === 'Waiting').length,
      inProgress: bookings.filter((b) => b.status === 'In Progress').length,
      completed: bookings.filter((b) => b.status === 'Completed').length,
    }),
    [bookings]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings.filter((b) => {
      if (statusFilter !== 'All' && b.status !== statusFilter) return false;
      if (branchFilter && b.branchId !== branchFilter) return false;
      if (sourceFilter !== 'All' && b.source !== sourceFilter) return false;
      if (dateFrom && b.date.slice(0, 10) < dateFrom) return false;
      if (dateTo && b.date.slice(0, 10) > dateTo) return false;
      if (q) {
        const haystack = `${b.customer ?? ''} ${b.plate ?? ''} ${b.id} ${b.vehicle}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [bookings, search, statusFilter, branchFilter, sourceFilter, dateFrom, dateTo]);

  const openCreate = () => {
    setRebookPrefill(null);
    setCreateOpen(true);
  };

  const openRebook = (booking: Booking) => {
    setRebookPrefill({
      customerId: booking.customerId,
      customerName: booking.customer ?? '',
      vehicle: booking.vehicle,
      plate: booking.plate,
      serviceIds: booking.serviceIds,
      branchId: booking.branchId,
    });
    setCreateOpen(true);
  };

  const handleCreated = (booking: Booking) => {
    setBookings((prev) => [booking, ...prev]);
  };

  const requestStatusChange = (booking: Booking, nextStatus: BookingStatus) => {
    setStatusChangeTarget({ booking, nextStatus });
  };

  const confirmStatusChange = async () => {
    if (!statusChangeTarget) return;
    const { booking, nextStatus } = statusChangeTarget;
    setChangingStatus(true);
    const previous = bookings;
    setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, status: nextStatus } : b)));
    try {
      const { booking: updated } = await api.patch<{ booking: Booking }>(`/bookings/${booking.id}`, { status: nextStatus });
      updateOneBooking(updated);
      toast.success(`Booking ${nextStatus === 'Cancelled' ? 'cancelled' : `moved to ${nextStatus}`}`);
      setStatusChangeTarget(null);
    } catch (err) {
      setBookings(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update booking');
    } finally {
      setChangingStatus(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => setSelectedIds(new Set(filtered.map((b) => b.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const bulkSetStatus = async (nextStatus: BookingStatus) => {
    const ids = [...selectedIds];
    const results = await Promise.allSettled(ids.map((id) => api.patch<{ booking: Booking }>(`/bookings/${id}`, { status: nextStatus })));
    let succeeded = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        updateOneBooking(r.value.booking);
        succeeded++;
      } else {
        console.error(`Failed to update booking ${ids[i]}`, r.reason);
      }
    });
    const failed = ids.length - succeeded;
    if (succeeded > 0) toast.success(`${succeeded} booking${succeeded === 1 ? '' : 's'} moved to ${nextStatus}`);
    if (failed > 0) toast.error(`${failed} booking${failed === 1 ? '' : 's'} couldn't be updated (invalid transition)`);
    clearSelection();
  };

  const openBayNotes = (booking: Booking) => {
    setBayNotesTarget(booking);
    setBayNotesForm({ bayId: booking.bayId ?? '', notes: booking.notes ?? '' });
  };

  const saveBayNotes = async () => {
    if (!bayNotesTarget) return;
    setSavingBayNotes(true);
    try {
      const { booking } = await api.patch<{ booking: Booking }>(`/bookings/${bayNotesTarget.id}`, {
        bayId: bayNotesForm.bayId || null,
        notes: bayNotesForm.notes,
      });
      updateOneBooking(booking);
      toast.success('Bay and notes updated');
      setBayNotesTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update');
    } finally {
      setSavingBayNotes(false);
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
      toast.success('Job card created');
      setConvertTarget(null);
      loadBookings();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to convert booking');
    } finally {
      setConverting(false);
    }
  };

  const exportCsv = () => {
    const header = ['Booking ID', 'Customer', 'Vehicle', 'Plate', 'Date', 'Time', 'Status', 'Branch', 'Services', 'Source'];
    const rows = filtered.map((b) => [
      b.id,
      b.customer ?? '',
      b.vehicle,
      b.plate ?? '',
      b.date.slice(0, 10),
      b.timeSlot,
      b.status,
      branches.find((br) => br.id === b.branchId)?.name ?? '',
      (b.services ?? []).join('; '),
      b.source,
    ]);
    const csv = [header, ...rows].map((r) => r.map((cell) => csvEscape(String(cell))).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const noPrereqs = customers.length === 0 || services.length === 0;

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; top: 0; left: 0; width: 100%; }
        }
      `}</style>

      <PageHeader
        title="Bookings"
        description="Appointments booked by staff or through your public booking page."
        action={
        <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={exportCsv}><DownloadIcon className="h-4 w-4" /> Export CSV</Button>
            <Button variant="secondary" onClick={() => window.print()}><PrinterIcon className="h-4 w-4" /> Print</Button>
            <Button onClick={openCreate} disabled={noPrereqs} title={noPrereqs ? 'Add a customer and a service first' : undefined}>
              <PlusIcon className="h-4 w-4" /> New booking
            </Button>
          </div>
        } />


      {lateAlerts.length > 0 &&
      <div className="mb-6 space-y-2">
          {lateAlerts.map((alert) =>
        <div
          key={alert.bookingId}
          className={`flex items-center justify-between gap-3 rounded-2xl border p-4 ${
          alert.escalated ?
          'border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10' :
          'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10'}`
          }>

              <div className="flex items-center gap-3">
                <AlertTriangleIcon className={`h-5 w-5 ${alert.escalated ? 'text-red-500' : 'text-amber-500'}`} />
                <div>
                  <p className="text-sm font-bold text-navy dark:text-slate-100">
                    {alert.customerName ?? 'A customer'} is {alert.minutesLate} min late for their {alert.timeSlot} booking
                  </p>
                  <p className="text-xs text-text-gray dark:text-slate-400">
                    {alert.escalated ? 'Booking auto-cancelled and the customer was texted.' : 'The customer was texted to check in.'}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => dismissLateAlert(alert)}>Dismiss</Button>
            </div>
        )}
        </div>
      }

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Total" value={String(stats.total)} icon={CalendarIcon} />
        <StatCard label="Pending" value={String(stats.pending)} icon={ClockIcon} />
        <StatCard label="Waiting" value={String(stats.waiting)} icon={ClockIcon} />
        <StatCard label="In Progress" value={String(stats.inProgress)} icon={WrenchIcon} />
        <StatCard label="Completed" value={String(stats.completed)} icon={ClipboardCheckIcon} />
      </div>

      {bookingLink &&
      <Card className="mb-6">
          <CardHeader title="Your public booking link" subtitle="Share this with customers so they can book themselves" />
          <div className="flex items-center gap-2 p-5 pt-0">
            <p className="flex-1 truncate rounded-xl bg-soft-gray px-3 py-2 text-sm text-navy dark:bg-slate-800/60 dark:text-slate-200">{bookingLink}</p>
            <Button variant="secondary" onClick={copyLink}><CopyIcon className="h-4 w-4" /> Copy</Button>
          </div>
        </Card>
      }

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input icon={SearchIcon} placeholder="Search customer, plate, vehicle…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        {branches.length > 1 &&
        <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="w-auto">
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        }
        <Button variant="ghost" size="sm" onClick={() => setAdvancedOpen((v) => !v)}>
          {advancedOpen ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />} Advanced filters
        </Button>
      </div>

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

      {advancedOpen &&
      <Card className="mb-4">
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
            <div>
              <Label htmlFor="bk-from">From date</Label>
              <Input id="bk-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="bk-to">To date</Label>
              <Input id="bk-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="bk-source">Source</Label>
              <Select id="bk-source" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as 'All' | 'staff' | 'public')}>
                <option value="All">All sources</option>
                <option value="staff">Staff-created</option>
                <option value="public">Online</option>
              </Select>
            </div>
          </div>
        </Card>
      }

      {selectedIds.size > 0 &&
      <div className="sticky top-2 z-20 mb-4 flex items-center justify-between gap-3 rounded-2xl border border-teal/40 bg-white p-3 shadow-soft-lg dark:border-teal/30 dark:bg-slate-900">
          <p className="pl-2 text-sm font-semibold text-navy dark:text-slate-100">{selectedIds.size} selected</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => bulkSetStatus('Waiting')}>Mark Waiting</Button>
            <Button size="sm" variant="secondary" onClick={() => bulkSetStatus('In Progress')}>Start</Button>
            <Button size="sm" variant="secondary" onClick={() => bulkSetStatus('Completed')}>Complete</Button>
            <Button size="sm" variant="danger" onClick={() => bulkSetStatus('Cancelled')}>Cancel</Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
          </div>
        </div>
      }

      {loading ?
      <Card><div className="p-5"><TableSkeleton rows={6} /></div></Card> :
      filtered.length === 0 ?
      <Card><EmptyState icon={CalendarIcon} title="No bookings" description="Bookings will appear here once customers book, or you add one manually." /></Card> :

      <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-4 py-3">
                    <input type="checkbox" checked={selectedIds.size > 0 && selectedIds.size === filtered.length} onChange={() => (selectedIds.size === filtered.length ? clearSelection() : selectAllVisible())} className="h-4 w-4 rounded border-border-soft text-teal focus:ring-teal dark:border-slate-700" />
                  </th>
                  <th className="px-4 py-3 font-bold">Customer</th>
                  <th className="px-4 py-3 font-bold">Vehicle</th>
                  <th className="px-4 py-3 font-bold">Date &amp; time</th>
                  <th className="px-4 py-3 font-bold">Services</th>
                  <th className="px-4 py-3 font-bold">Bay</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const allowedNext = ALLOWED_TRANSITIONS[b.status] ?? [];
                  return (
                    <tr key={b.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selectedIds.has(b.id)} onChange={() => toggleSelect(b.id)} className="h-4 w-4 rounded border-border-soft text-teal focus:ring-teal dark:border-slate-700" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-navy dark:text-slate-100">{b.customer}</p>
                          {b.source === 'public' && <Badge tone="teal">Online</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-gray dark:text-slate-400">
                        <span className="flex items-center gap-1"><CarIcon className="h-3.5 w-3.5" /> {b.vehicle}{b.plate ? ` · ${b.plate}` : ''}</span>
                      </td>
                      <td className="px-4 py-3 text-text-gray dark:text-slate-400">{formatDate(b.date)} · {b.timeSlot}</td>
                      <td className="px-4 py-3 text-text-gray dark:text-slate-400">{(b.services ?? []).join(', ')}</td>
                      <td className="px-4 py-3 text-text-gray dark:text-slate-400">{b.bay ?? '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {allowedNext.map((next) =>
                          <Button key={next} size="sm" variant={next === 'Cancelled' ? 'ghost' : 'secondary'} onClick={() => requestStatusChange(b, next)}>
                              {STATUS_CONFIRM_COPY[next].confirmLabel}
                            </Button>
                          )}
                          <button onClick={() => openBayNotes(b)} aria-label="Bay & notes" className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">
                            <StickyNoteIcon className="h-4 w-4" />
                          </button>
                          {b.status === 'Completed' &&
                          <button onClick={() => openRebook(b)} aria-label="Re-book" className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">
                              <RepeatIcon className="h-4 w-4" />
                            </button>
                          }
                          {!b.jobCardId && b.status !== 'Cancelled' &&
                          <Button size="sm" variant="outline" onClick={() => openConvert(b)}>
                              <WrenchIcon className="h-3.5 w-3.5" /> Job card
                            </Button>
                          }
                          {b.jobCardId && <Badge tone="green"><ClipboardCheckIcon className="h-3 w-3" /> Job card</Badge>}
                        </div>
                      </td>
                    </tr>);

                })}
              </tbody>
            </table>
          </div>
        </Card>
      }

      {/* Print-only clean table — hidden on screen, shown via @media print above */}
      <div ref={printRef} className="print-area hidden">
        <h1 className="mb-4 text-lg font-bold">Bookings — {new Date().toLocaleDateString()}</h1>
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr>
              <th className="border-b border-black/20 py-1.5 pr-3">Customer</th>
              <th className="border-b border-black/20 py-1.5 pr-3">Vehicle</th>
              <th className="border-b border-black/20 py-1.5 pr-3">Date &amp; time</th>
              <th className="border-b border-black/20 py-1.5 pr-3">Services</th>
              <th className="border-b border-black/20 py-1.5 pr-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) =>
            <tr key={b.id}>
                <td className="border-b border-black/10 py-1.5 pr-3">{b.customer}</td>
                <td className="border-b border-black/10 py-1.5 pr-3">{b.vehicle}{b.plate ? ` (${b.plate})` : ''}</td>
                <td className="border-b border-black/10 py-1.5 pr-3">{formatDate(b.date)} · {b.timeSlot}</td>
                <td className="border-b border-black/10 py-1.5 pr-3">{(b.services ?? []).join(', ')}</td>
                <td className="border-b border-black/10 py-1.5 pr-3">{b.status}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CreateBookingModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
        branches={branches}
        services={services}
        lockedBranchId={branches.length === 1 ? branches[0].id : undefined}
        prefill={rebookPrefill} />


      {/* Status change confirmation */}
      <Modal
        open={!!statusChangeTarget}
        onClose={() => setStatusChangeTarget(null)}
        title={statusChangeTarget ? STATUS_CONFIRM_COPY[statusChangeTarget.nextStatus].title : ''}
        footer={
        <>
            <Button variant="secondary" onClick={() => setStatusChangeTarget(null)}>Cancel</Button>
            <Button
            variant={statusChangeTarget && STATUS_CONFIRM_COPY[statusChangeTarget.nextStatus].danger ? 'danger' : 'primary'}
            loading={changingStatus}
            onClick={confirmStatusChange}>

              {statusChangeTarget ? STATUS_CONFIRM_COPY[statusChangeTarget.nextStatus].confirmLabel : 'Confirm'}
            </Button>
          </>
        }>

        <p className="text-sm text-text-gray dark:text-slate-400">
          {statusChangeTarget ? STATUS_CONFIRM_COPY[statusChangeTarget.nextStatus].body : ''}
        </p>
      </Modal>

      {/* Bay & notes */}
      <Modal
        open={!!bayNotesTarget}
        onClose={() => setBayNotesTarget(null)}
        title={bayNotesTarget ? `Bay & notes — ${bayNotesTarget.customer}` : 'Bay & notes'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setBayNotesTarget(null)}>Cancel</Button>
            <Button loading={savingBayNotes} onClick={saveBayNotes}>Save</Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="bn-bay">Bay</Label>
            <Select id="bn-bay" value={bayNotesForm.bayId} onChange={(e) => setBayNotesForm((f) => ({ ...f, bayId: e.target.value }))}>
              <option value="">Unassigned</option>
              {bays.map((bay) => <option key={bay.id} value={bay.id}>{bay.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="bn-notes">Internal notes</Label>
            <textarea
              id="bn-notes"
              value={bayNotesForm.notes}
              onChange={(e) => setBayNotesForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full min-h-[96px] rounded-xl border border-border-soft bg-white px-3.5 py-2.5 text-sm text-navy transition focus:border-bright-blue focus:ring-2 focus:ring-bright-blue/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />

          </div>
        </div>
      </Modal>

      {/* Convert to job card */}
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
