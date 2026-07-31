import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CarIcon, ClipboardListIcon, CalendarIcon, ReceiptIcon, LogOutIcon, PlusIcon, DownloadIcon, CreditCardIcon } from 'lucide-react';
import { Logo } from '../../components/layout/Logo';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { useCustomerPortal } from '../../context/CustomerPortalContext';
import { Vehicle } from '../../types/vehicle';
import { JobCard } from '../../types/jobCard';
import { Booking } from '../../types/booking';
import { CustomerInvoice } from '../../types/customerInvoice';
import { formatDate, formatCurrency } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { downloadDocumentPdf } from '../../lib/pdf';
import { submitPayHereCheckout } from '../../lib/payhereCheckout';

type Tab = 'vehicles' | 'jobs' | 'bookings' | 'invoices';
const TABS: { key: Tab; label: string; icon: typeof CarIcon }[] = [
  { key: 'vehicles', label: 'Vehicles', icon: CarIcon },
  { key: 'jobs', label: 'Service History', icon: ClipboardListIcon },
  { key: 'bookings', label: 'Bookings', icon: CalendarIcon },
  { key: 'invoices', label: 'Invoices', icon: ReceiptIcon },
];

export function PortalDashboard() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { customer, garageName, bootstrapping, logout } = useCustomerPortal();

  const [tab, setTab] = useState<Tab>('vehicles');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);

  useEffect(() => {
    if (!bootstrapping && !customer && slug) {
      navigate(`/portal/${slug}/login`, { replace: true });
    }
  }, [bootstrapping, customer, slug, navigate]);

  useEffect(() => {
    if (!customer) return;
    setLoading(true);
    Promise.all([
      api.get<{ vehicles: Vehicle[] }>('/customer-portal/vehicles').then((r) => setVehicles(r.vehicles)),
      api.get<{ jobCards: JobCard[] }>('/customer-portal/jobs').then((r) => setJobs(r.jobCards)),
      api.get<{ bookings: Booking[] }>('/customer-portal/bookings').then((r) => setBookings(r.bookings)),
      api.get<{ invoices: CustomerInvoice[] }>('/customer-portal/invoices').then((r) => setInvoices(r.invoices)),
    ])
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load your data'))
      .finally(() => setLoading(false));
  }, [customer]);

  const payNow = async (inv: CustomerInvoice) => {
    setPayingId(inv.id);
    try {
      const { actionUrl, fields } = await api.post<{ actionUrl: string; fields: Record<string, string> }>(
        `/customer-portal/invoices/${inv.id}/checkout`
      );
      submitPayHereCheckout(actionUrl, fields);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to start payment');
      setPayingId(null);
    }
  };

  const handleLogout = async () => {
    if (!slug) return;
    await logout(slug);
    navigate(`/portal/${slug}/login`);
  };

  const downloadInvoice = (inv: CustomerInvoice) => {
    downloadDocumentPdf({
      title: 'Invoice',
      number: inv.invoiceNumber,
      date: inv.createdAt,
      garageName,
      customerName: customer?.name,
      vehicle: inv.vehicle,
      plate: inv.plate,
      items: inv.items,
      subtotal: inv.subtotal,
      discountPct: inv.discountPct,
      discountAmount: inv.discountAmount,
      taxAmount: inv.taxAmount,
      total: inv.total,
      extraLines: [
        { label: 'Paid', value: formatCurrency(inv.paidAmount) },
        { label: 'Balance', value: formatCurrency(inv.balance) },
      ],
    });
  };

  if (bootstrapping || !customer) return null;

  return (
    <div className="min-h-screen bg-soft-gray dark:bg-slate-950">
      <div className="border-b border-border-soft bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-bold text-navy dark:text-slate-100">{customer.name}</p>
              <p className="text-xs text-text-gray dark:text-slate-400">{garageName}</p>
            </div>
            <Button variant="secondary" onClick={handleLogout}><LogOutIcon className="h-4 w-4" /> Sign out</Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold text-navy dark:text-slate-100">Welcome back, {customer.name.split(' ')[0]}</h1>
          <Link to={`/book/${slug}`}>
            <Button><PlusIcon className="h-4 w-4" /> New booking</Button>
          </Link>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${tab === t.key ? 'bg-griptor-gradient text-white' : 'bg-white text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>

        <Card>
          {loading ? (
            <div className="p-5"><TableSkeleton rows={4} /></div>
          ) : tab === 'vehicles' ? (
            vehicles.length === 0 ? (
              <EmptyState icon={CarIcon} title="No vehicles on file" description="Your garage will add your vehicles when you visit." />
            ) : (
              <div className="divide-y divide-border-soft dark:divide-slate-800">
                {vehicles.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 p-4">
                    <CarIcon className="h-5 w-5 text-teal" />
                    <div>
                      <p className="font-bold text-navy dark:text-slate-100">{v.label}</p>
                      <p className="text-xs text-text-gray dark:text-slate-400">
                        {[v.plate, v.make, v.model, v.year].filter(Boolean).join(' · ') || 'No further details'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : tab === 'jobs' ? (
            jobs.length === 0 ? (
              <EmptyState icon={ClipboardListIcon} title="No service history yet" description="Completed jobs will show up here." />
            ) : (
              <div className="divide-y divide-border-soft dark:divide-slate-800">
                {jobs.map((j) => (
                  <div key={j.id} className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-bold text-navy dark:text-slate-100">{j.service || 'Service'}</p>
                      <p className="text-xs text-text-gray dark:text-slate-400">{j.vehicle}{j.plate ? ` · ${j.plate}` : ''} · {formatDate(j.createdAt)}</p>
                    </div>
                    <Badge tone={j.status === 'Completed' ? 'green' : 'blue'}>{j.status}</Badge>
                  </div>
                ))}
              </div>
            )
          ) : tab === 'bookings' ? (
            bookings.length === 0 ? (
              <EmptyState icon={CalendarIcon} title="No bookings yet" description="Book your next appointment online anytime." />
            ) : (
              <div className="divide-y divide-border-soft dark:divide-slate-800">
                {bookings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-bold text-navy dark:text-slate-100">{(b.services ?? []).join(', ') || 'Booking'}</p>
                      <p className="text-xs text-text-gray dark:text-slate-400">{formatDate(b.date)} · {b.timeSlot}</p>
                    </div>
                    <Badge tone={b.status === 'Completed' ? 'green' : b.status === 'Cancelled' ? 'red' : 'blue'}>{b.status}</Badge>
                  </div>
                ))}
              </div>
            )
          ) : (
            invoices.length === 0 ? (
              <EmptyState icon={ReceiptIcon} title="No invoices yet" description="Your invoices will appear here after a visit." />
            ) : (
              <div className="divide-y divide-border-soft dark:divide-slate-800">
                {invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-bold text-navy dark:text-slate-100">{inv.invoiceNumber}</p>
                      <p className="text-xs text-text-gray dark:text-slate-400">{formatDate(inv.createdAt)} · {formatCurrency(inv.total)} · {inv.paymentStatus}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {inv.paymentStatus !== 'Paid' && (
                        <Button size="sm" onClick={() => payNow(inv)} loading={payingId === inv.id}>
                          <CreditCardIcon className="h-3.5 w-3.5" /> Pay now
                        </Button>
                      )}
                      <button onClick={() => downloadInvoice(inv)} className="flex items-center gap-1 text-xs font-semibold text-royal hover:underline dark:text-blue-300">
                        <DownloadIcon className="h-3.5 w-3.5" /> PDF
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </Card>
      </div>
    </div>
  );
}
