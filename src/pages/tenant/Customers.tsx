import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { SearchIcon, UsersIcon, StarIcon, CarIcon, PhoneIcon, MailIcon, PlusIcon, BuildingIcon, TrashIcon, DownloadIcon, WalletIcon, AlertTriangleIcon, CopyIcon, PencilIcon, CheckIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input, Select, Label } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { StatCard } from '../../components/ui/StatCard';
import { Customer, CustomerType, CustomerStatus, RegistrationType, CREDIT_ELIGIBLE_CUSTOMER_TYPES } from '../../types/customer';
import { DealerFormModal } from './customers/DealerFormModal';
import { MODULES } from '../../data/modules';
import { Vehicle } from '../../types/vehicle';
import { CustomerStatement } from '../../types/statement';
import { CustomerHistory, TimelineEvent } from '../../types/customerHistory';
import { LoyaltyReward } from '../../types/loyaltyReward';
import { Salesperson } from '../../types/salesperson';
import { SalespersonAssignment } from '../../types/salespersonAssignment';
import { PriceList } from '../../types/priceList';
import { DealerPerformance } from '../../types/dealerPerformance';
import { DEALER_APPROVAL_STATUSES } from '../../types/dealerProfile';
import { formatDate, formatCurrency } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useAuth, useHasPermission } from '../../context/AuthContext';

const TAG_TONE: Record<string, 'purple' | 'teal' | 'blue' | 'amber' | 'gray' | 'red' | 'green'> = {
  VIP: 'purple',
  Fleet: 'teal',
  Regular: 'blue',
  New: 'green',
  'At Risk': 'red'
};

const CUSTOMER_TYPE_LABEL: Record<CustomerType, string> = {
  individual: 'Individual',
  retail: 'Retail',
  corporate: 'Corporate',
  wholesale: 'Wholesale',
  dealer: 'Dealer',
};

const emptyForm = {
  name: '', email: '', phone: '', vehicle: '',
  type: 'individual' as CustomerType,
  contactPerson: '', creditLimit: '', discountPct: '', creditPeriodDays: '',
  billingAddress: '', shippingAddress: '', taxNumber: '', status: 'Active' as CustomerStatus,
  defaultPriceListId: '',
};

function isCreditEligible(type: CustomerType): boolean {
  return CREDIT_ELIGIBLE_CUSTOMER_TYPES.includes(type);
}

function exportStatementCsv(customer: Customer, statement: CustomerStatement) {
  const rows = [
    ['Invoice #', 'Date', 'Total', 'Paid', 'Balance', 'Status'],
    ...statement.invoices.map((inv) => [inv.invoiceNumber, formatDate(inv.createdAt), String(inv.total), String(inv.paidAmount), String(inv.balance), inv.status]),
  ];
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${customer.name.replace(/\s+/g, '-')}-statement.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function Customers() {
  const { moduleId } = useParams();
  const { user } = useAuth();
  const canRespondApprovals = useHasPermission('approvals:respond');
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  // Registration-type switch on the create modal — picking 'dealer' hands
  // off to the full DealerFormModal wizard instead of continuing with this
  // page's own simple form (per the "if customer keep that same form, if
  // dealer add a dealer form" instruction). Also reused to route "Edit" on
  // an existing dealer straight into that same wizard, since the simple
  // edit form below has no dealer-profile fields at all.
  const [registrationType, setRegistrationType] = useState<RegistrationType>('customer');
  const [dealerModalOpen, setDealerModalOpen] = useState(false);
  const [editingDealer, setEditingDealer] = useState<Customer | null>(null);
  const loyaltyEnabled = user?.addOns?.includes('crm-loyalty') ?? false;
  const fleetEnabled = user?.addOns?.includes('gms-fleet') ?? false;

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [newVehicleLabel, setNewVehicleLabel] = useState('');
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [history, setHistory] = useState<CustomerHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activatingPortal, setActivatingPortal] = useState(false);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [redeemRewardId, setRedeemRewardId] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [salespersons, setSalespersons] = useState<Salesperson[]>([]);
  const [assignment, setAssignment] = useState<SalespersonAssignment | null>(null);
  const [assignSalespersonId, setAssignSalespersonId] = useState('');
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [performance, setPerformance] = useState<DealerPerformance | null>(null);
  const [approvalAction, setApprovalAction] = useState<'advance' | 'reject' | null>(null);
  const [approvalForm, setApprovalForm] = useState({ requestedCreditLimit: '', recommendedCreditLimit: '', approvedCreditLimit: '', creditTerms: '', rejectionReason: '' });
  const [approvalSaving, setApprovalSaving] = useState(false);
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(null);

  const loadCustomers = () => {
    setLoading(true);
    api
      .get<{ customers: Customer[] }>('/customers')
      .then(({ customers }) => setCustomers(customers))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load customers'))
      .finally(() => setLoading(false));
  };

  useEffect(loadCustomers, []);
  useEffect(() => {
    api.get<{ salespersons: Salesperson[] }>('/salespersons').then(({ salespersons }) => setSalespersons(salespersons)).catch(() => setSalespersons([]));
    // Empty when Price Lists are disabled or none exist yet — the selector
    // below only renders once there's something to pick.
    api.get<{ priceLists: PriceList[] }>('/price-lists').then(({ priceLists }) => setPriceLists(priceLists)).catch(() => setPriceLists([]));
  }, []);

  // Deep-link support (e.g. from the Corporate Accounts overview page): once
  // customers are loaded, open the matching one's detail modal if ?customer=
  // is present, then drop the param so it doesn't reopen on a later reload.
  useEffect(() => {
    const customerId = searchParams.get('customer');
    if (!customerId || customers.length === 0) return;
    const match = customers.find((c) => c.id === customerId);
    if (match) setSelected(match);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('customer');
      return next;
    }, { replace: true });
  }, [customers, searchParams, setSearchParams]);

  useEffect(() => {
    api
      .get<{ rewards: LoyaltyReward[] }>('/loyalty-rewards')
      .then(({ rewards }) => setRewards(rewards.filter((r) => r.active)))
      .catch(() => setRewards([]));
  }, []);

  const portalLink = user?.garageSlug ? `${window.location.origin}/portal/${user.garageSlug}` : null;
  const copyPortalLink = () => {
    if (!portalLink) return;
    navigator.clipboard.writeText(portalLink);
    toast.success('Link copied');
  };

  // Only offer modules this garage actually has enabled, and only ones that
  // can create customers (both nav-share Customers page like gms/crm, or
  // auto-create them like booking-system) — a tenant without Booking System
  // shouldn't see a filter option that can never match anything.
  const moduleFilterOptions = useMemo(
    () => MODULES.filter((m) => user?.modules?.includes(m.id)),
    [user]
  );

  const filtered = useMemo(
    () =>
      customers.filter(
        (c) =>
          (c.name.toLowerCase().includes(query.toLowerCase()) || c.email.toLowerCase().includes(query.toLowerCase())) &&
          (!moduleFilter || c.sourceModule === moduleFilter)
      ),
    [customers, query, moduleFilter]
  );

  const openCreate = () => {
    setForm(emptyForm);
    setEditingCustomerId(null);
    setRegistrationType('customer');
    setAddOpen(true);
  };

  const openEdit = (customer: Customer) => {
    if (customer.registrationType === 'dealer') {
      setSelected(null);
      setEditingDealer(customer);
      setDealerModalOpen(true);
      return;
    }
    setForm({
      name: customer.name,
      email: customer.email,
      phone: customer.phone || '',
      vehicle: '',
      type: customer.type,
      contactPerson: customer.contactPerson || '',
      creditLimit: customer.creditLimit ? String(customer.creditLimit) : '',
      discountPct: customer.discountPct ? String(customer.discountPct) : '',
      creditPeriodDays: customer.creditPeriodDays ? String(customer.creditPeriodDays) : '',
      billingAddress: customer.billingAddress || '',
      shippingAddress: customer.shippingAddress || '',
      taxNumber: customer.taxNumber || '',
      status: customer.status,
      defaultPriceListId: customer.defaultPriceListId || '',
    });
    setEditingCustomerId(customer.id);
    setSelected(null);
    setAddOpen(true);
  };

  const closeModal = () => {
    setAddOpen(false);
    setEditingCustomerId(null);
    setRegistrationType('customer');
  };

  const closeDealerModal = () => {
    setDealerModalOpen(false);
    setEditingDealer(null);
  };

  const handleDealerSaved = (customer: Customer) => {
    setCustomers((prev) => (prev.some((c) => c.id === customer.id) ? prev.map((c) => (c.id === customer.id ? customer : c)) : [customer, ...prev]));
  };

  const handleDeleteCustomer = async (customer: Customer) => {
    const label = customer.registrationType === 'dealer' ? 'dealer' : 'customer';
    if (!window.confirm(`Delete ${label} "${customer.name}"? This cannot be undone.`)) return;
    setDeletingCustomerId(customer.id);
    try {
      await api.delete(`/customers/${customer.id}`);
      setCustomers((prev) => prev.filter((c) => c.id !== customer.id));
      if (selected?.id === customer.id) setSelected(null);
      toast.success(`${label === 'dealer' ? 'Dealer' : 'Customer'} deleted`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to delete ${label}`);
    } finally {
      setDeletingCustomerId(null);
    }
  };

  const submitApprovalAction = async () => {
    if (!selected || !approvalAction) return;
    if (approvalAction === 'reject' && !approvalForm.rejectionReason.trim()) {
      toast.error('A rejection reason is required');
      return;
    }
    setApprovalSaving(true);
    try {
      const { dealerProfile } = await api.patch<{ dealerProfile: NonNullable<Customer['dealerProfile']> }>(`/customers/${selected.id}/dealer-approval`, {
        action: approvalAction,
        requestedCreditLimit: approvalForm.requestedCreditLimit ? Number(approvalForm.requestedCreditLimit) : undefined,
        recommendedCreditLimit: approvalForm.recommendedCreditLimit ? Number(approvalForm.recommendedCreditLimit) : undefined,
        approvedCreditLimit: approvalForm.approvedCreditLimit ? Number(approvalForm.approvedCreditLimit) : undefined,
        creditTerms: approvalForm.creditTerms || undefined,
        rejectionReason: approvalAction === 'reject' ? approvalForm.rejectionReason.trim() : undefined,
      });
      setSelected((prev) => (prev ? { ...prev, dealerProfile } : prev));
      setCustomers((prev) => prev.map((c) => (c.id === selected.id ? { ...c, dealerProfile } : c)));
      toast.success(approvalAction === 'reject' ? 'Dealer rejected' : `Advanced to ${dealerProfile.approvalStatus}`);
      setApprovalAction(null);
      setApprovalForm({ requestedCreditLimit: '', recommendedCreditLimit: '', approvedCreditLimit: '', creditTerms: '', rejectionReason: '' });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update approval status');
    } finally {
      setApprovalSaving(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const creditEligible = isCreditEligible(form.type);
      if (editingCustomerId) {
        const { customer } = await api.patch<{ customer: Customer }>(`/customers/${editingCustomerId}`, {
          name: form.name,
          phone: form.phone,
          type: form.type,
          contactPerson: creditEligible ? form.contactPerson : undefined,
          creditLimit: creditEligible ? Number(form.creditLimit) || 0 : 0,
          discountPct: creditEligible ? Number(form.discountPct) || 0 : 0,
          creditPeriodDays: creditEligible ? Number(form.creditPeriodDays) || 30 : undefined,
          billingAddress: form.billingAddress || undefined,
          shippingAddress: form.shippingAddress || undefined,
          taxNumber: form.taxNumber || undefined,
          status: form.status,
          defaultPriceListId: form.defaultPriceListId || null,
        });
        setCustomers((prev) => prev.map((c) => (c.id === customer.id ? customer : c)));
        toast.success('Customer updated');
      } else {
        const { customer } = await api.post<{ customer: Customer }>('/customers', {
          name: form.name,
          email: form.email,
          phone: form.phone,
          type: form.type,
          contactPerson: creditEligible ? form.contactPerson : undefined,
          creditLimit: creditEligible ? Number(form.creditLimit) || 0 : 0,
          discountPct: creditEligible ? Number(form.discountPct) || 0 : 0,
          creditPeriodDays: creditEligible ? Number(form.creditPeriodDays) || 30 : undefined,
          billingAddress: form.billingAddress || undefined,
          shippingAddress: form.shippingAddress || undefined,
          taxNumber: form.taxNumber || undefined,
          defaultPriceListId: form.defaultPriceListId || undefined,
          sourceModule: moduleId,
        });
        // First vehicle (if given) becomes a real Vehicle document instead of
        // the legacy free-text `vehicles` array — same field, real storage.
        if (form.vehicle.trim()) {
          await api.post(`/customers/${customer.id}/vehicles`, { label: form.vehicle.trim() });
        }
        toast.success('Customer added');
        loadCustomers();
      }
      closeModal();
      setForm(emptyForm);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to ${editingCustomerId ? 'update' : 'add'} customer`);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!selected) {
      setVehicles([]);
      setStatement(null);
      setHistory(null);
      setAssignment(null);
      setPerformance(null);
      return;
    }

    api
      .get<{ assignments: SalespersonAssignment[] }>(`/salesperson-assignments?customerId=${selected.id}`)
      .then(({ assignments }) => {
        const active = assignments.find((a) => a.active) ?? assignments[0] ?? null;
        setAssignment(active);
        setAssignSalespersonId(active?.salespersonId ?? '');
      })
      .catch(() => setAssignment(null));
    setVehiclesLoading(true);
    api
      .get<{ vehicles: Vehicle[] }>(`/customers/${selected.id}/vehicles`)
      .then(({ vehicles }) => setVehicles(vehicles))
      .catch(() => setVehicles([]))
      .finally(() => setVehiclesLoading(false));

    if (isCreditEligible(selected.type)) {
      api
        .get<CustomerStatement>(`/customers/${selected.id}/statement`)
        .then(setStatement)
        .catch(() => setStatement(null));
    } else {
      setStatement(null);
    }

    if (selected.registrationType === 'dealer') {
      api
        .get<DealerPerformance>(`/customers/${selected.id}/dealer-performance`)
        .then(setPerformance)
        .catch(() => setPerformance(null));
    } else {
      setPerformance(null);
    }

    setHistoryLoading(true);
    api
      .get<CustomerHistory>(`/customers/${selected.id}/history`)
      .then(setHistory)
      .catch(() => setHistory(null))
      .finally(() => setHistoryLoading(false));
  }, [selected]);

  const handleAddVehicle = async () => {
    if (!selected || !newVehicleLabel.trim()) return;
    setAddingVehicle(true);
    try {
      const { vehicle } = await api.post<{ vehicle: Vehicle }>(`/customers/${selected.id}/vehicles`, { label: newVehicleLabel.trim() });
      setVehicles((prev) => [vehicle, ...prev]);
      setNewVehicleLabel('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add vehicle');
    } finally {
      setAddingVehicle(false);
    }
  };

  const handleRemoveVehicle = async (vehicleId: string) => {
    if (!selected) return;
    try {
      await api.delete(`/customers/${selected.id}/vehicles/${vehicleId}`);
      setVehicles((prev) => prev.filter((v) => v.id !== vehicleId));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove vehicle');
    }
  };

  const handleRedeem = async () => {
    if (!selected || !redeemRewardId) return;
    setRedeeming(true);
    try {
      const { customer } = await api.post<{ customer: Customer }>(`/customers/${selected.id}/redeem`, { rewardId: redeemRewardId });
      setCustomers((prev) => prev.map((c) => c.id === customer.id ? customer : c));
      setSelected(customer);
      setRedeemRewardId('');
      toast.success('Reward redeemed');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to redeem reward');
    } finally {
      setRedeeming(false);
    }
  };

  const handleActivatePortal = async () => {
    if (!selected) return;
    setActivatingPortal(true);
    try {
      const { tempPassword } = await api.post<{ tempPassword: string }>(`/customers/${selected.id}/portal-password`);
      setCustomers((prev) => prev.map((c) => c.id === selected.id ? { ...c, hasPortalAccount: true } : c));
      setSelected((prev) => prev && { ...prev, hasPortalAccount: true });
      toast.success(`Temporary password: ${tempPassword}`, {
        description: 'Share this with the customer directly — it will not be shown again.',
        duration: 20000,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to enable portal access');
    } finally {
      setActivatingPortal(false);
    }
  };

  const saveAssignment = async () => {
    if (!selected || !assignSalespersonId || assignSalespersonId === assignment?.salespersonId) return;
    setSavingAssignment(true);
    try {
      if (assignment) await api.delete(`/salesperson-assignments/${assignment.id}`);
      const { assignment: created } = await api.post<{ assignment: SalespersonAssignment }>('/salesperson-assignments', {
        salespersonId: assignSalespersonId,
        customerId: selected.id,
      });
      setAssignment(created);
      toast.success('Salesperson assigned');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to assign salesperson');
    } finally {
      setSavingAssignment(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Customers"
        description={`${customers.length} customers${loyaltyEnabled ? ' · Loyalty & Rewards active' : ''}`}
        action={<Button onClick={openCreate}><PlusIcon className="h-4 w-4" /> Add customer</Button>} />


      {portalLink &&
      <Card className="mb-6">
          <CardHeader title="Your customer portal link" subtitle="Customers can sign up here to view their own vehicles, history, and invoices" />
          <div className="flex items-center gap-2 p-5 pt-0">
            <p className="flex-1 truncate rounded-xl bg-soft-gray px-3 py-2 text-sm text-navy dark:bg-slate-800/60 dark:text-slate-200">{portalLink}</p>
            <Button variant="secondary" onClick={copyPortalLink}><CopyIcon className="h-4 w-4" /> Copy</Button>
          </div>
        </Card>
      }

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border-soft p-4 dark:border-slate-800">
          <Input icon={SearchIcon} placeholder="Search customers…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search customers" className="flex-1" />
          {moduleFilterOptions.length > 0 &&
          <Select aria-label="Filter by module" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className="w-auto">
              <option value="">All modules</option>
              {moduleFilterOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          }
        </div>

        {loading ?
        <div className="p-5"><TableSkeleton rows={6} /></div> :
        filtered.length === 0 ?
        <EmptyState icon={UsersIcon} title="No customers found" description="Try a different search." /> :

        <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Customer</th>
                  <th className="px-5 py-3 font-bold">Tags</th>
                  <th className="px-5 py-3 text-center font-bold">Visits</th>
                  <th className="px-5 py-3 font-bold">Last visit</th>
                  {loyaltyEnabled && <th className="px-5 py-3 text-right font-bold">Loyalty pts</th>}
                  <th className="px-5 py-3 text-right font-bold">Total spend</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) =>
              <tr key={c.id} onClick={() => setSelected(c)} className="cursor-pointer border-b border-border-soft transition last:border-0 hover:bg-soft-gray dark:border-slate-800 dark:hover:bg-slate-800/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.name} size="sm" />
                        <div>
                          <p className="font-bold text-navy dark:text-slate-100">{c.name}</p>
                          <p className="text-xs text-text-gray dark:text-slate-400">{c.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.map((t) => <Badge key={t} tone={TAG_TONE[t] || 'gray'}>{t}</Badge>)}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-center font-semibold text-navy dark:text-slate-100">{c.visits}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{c.lastVisit ? formatDate(c.lastVisit) : 'Never'}</td>
                    {loyaltyEnabled &&
                <td className="px-5 py-3 text-right">
                        <span className="inline-flex items-center gap-1 font-bold text-amber-500"><StarIcon className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {c.loyaltyPoints}</span>
                      </td>
                }
                    <td className="px-5 py-3 text-right font-bold text-navy dark:text-slate-100">{formatCurrency(c.totalSpend)}</td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        }
      </Card>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name || ''} size="md">
        {selected &&
        <div>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={selected.name} size="lg" />
                <div>
                  <p className="flex items-center gap-1.5 font-bold text-navy dark:text-slate-100">
                    {selected.name}
                    {isCreditEligible(selected.type) && <Badge tone="purple"><BuildingIcon className="mr-1 inline h-3 w-3" />{CUSTOMER_TYPE_LABEL[selected.type]}</Badge>}
                    {selected.status !== 'Active' && <Badge tone={selected.status === 'Blocked' ? 'red' : 'gray'}>{selected.status}</Badge>}
                  </p>
                  <p className="flex items-center gap-1 text-sm text-text-gray dark:text-slate-400"><MailIcon className="h-3.5 w-3.5" /> {selected.email}</p>
                  {selected.phone && <p className="flex items-center gap-1 text-sm text-text-gray dark:text-slate-400"><PhoneIcon className="h-3.5 w-3.5" /> {selected.phone}</p>}
                  {isCreditEligible(selected.type) && selected.contactPerson && <p className="text-sm text-text-gray dark:text-slate-400">Contact: {selected.contactPerson}</p>}
                  {selected.taxNumber && <p className="text-sm text-text-gray dark:text-slate-400">Tax No: {selected.taxNumber}</p>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => openEdit(selected)} aria-label={`Edit ${selected.name}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">
                  <PencilIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteCustomer(selected)}
                  disabled={deletingCustomerId === selected.id}
                  aria-label={`Delete ${selected.name}`}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-500/10">

                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            {selected.registrationType === 'dealer' && selected.dealerProfile &&
          <div className="mt-4 rounded-xl border border-border-soft p-3 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Dealer profile</p>
                  <Badge tone="purple">{selected.dealerProfile.dealerCode}</Badge>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm text-text-gray dark:text-slate-400 sm:grid-cols-2">
                  {selected.dealerProfile.legalBusinessName && <p>Legal name: {selected.dealerProfile.legalBusinessName}</p>}
                  {selected.dealerProfile.businessType && <p>Business type: {selected.dealerProfile.businessType}</p>}
                  {selected.dealerProfile.dealerCategory && <p>Category: {selected.dealerProfile.dealerCategory}</p>}
                  {selected.dealerProfile.mainContact?.person && <p>Main contact: {selected.dealerProfile.mainContact.person}</p>}
                  {selected.dealerProfile.vatRegistered && <p>VAT: {selected.dealerProfile.vatNumber || 'Registered'}</p>}
                </div>
              </div>
          }

            {selected.registrationType === 'dealer' && selected.dealerProfile?.approvalStatus &&
          <div className="mt-4 rounded-xl border border-border-soft p-3 dark:border-slate-800">
                {(() => {
              const approvalStatus = selected.dealerProfile?.approvalStatus as (typeof DEALER_APPROVAL_STATUSES)[number];
              const currentIdx = DEALER_APPROVAL_STATUSES.indexOf(approvalStatus);
              return (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Credit approval</p>
                    <Badge tone={approvalStatus === 'Activated' ? 'green' : approvalStatus === 'Rejected' ? 'red' : 'amber'}>
                      {approvalStatus}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {DEALER_APPROVAL_STATUSES.filter((s) => s !== 'Rejected').map((s) => {
                      const stepIdx = DEALER_APPROVAL_STATUSES.indexOf(s);
                      return <span key={s} className={`h-1.5 flex-1 rounded-full ${stepIdx <= currentIdx ? 'bg-griptor-gradient' : 'bg-slate-200 dark:bg-slate-700'}`} title={s} />;
                    })}
                  </div>
                </>);

            })()}
                <div className="mt-2 space-y-0.5 text-xs text-text-gray dark:text-slate-400">
                  {selected.dealerProfile.requestedCreditLimit !== undefined && <p>Requested: {formatCurrency(selected.dealerProfile.requestedCreditLimit)}</p>}
                  {selected.dealerProfile.recommendedCreditLimit !== undefined && <p>Recommended: {formatCurrency(selected.dealerProfile.recommendedCreditLimit)}</p>}
                  {selected.dealerProfile.approvedCreditLimit !== undefined && <p>Approved: {formatCurrency(selected.dealerProfile.approvedCreditLimit)}</p>}
                  {selected.dealerProfile.creditTerms && <p>Terms: {selected.dealerProfile.creditTerms}</p>}
                  {selected.dealerProfile.approvalStatus === 'Rejected' && selected.dealerProfile.rejectionReason && <p className="text-red-500">Rejected: {selected.dealerProfile.rejectionReason}</p>}
                </div>
                {canRespondApprovals && selected.dealerProfile.approvalStatus !== 'Activated' && selected.dealerProfile.approvalStatus !== 'Rejected' &&
            <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => setApprovalAction('advance')}><CheckIcon className="h-3.5 w-3.5" /> Advance</Button>
                    <Button size="sm" variant="ghost" onClick={() => setApprovalAction('reject')}><XIcon className="h-3.5 w-3.5" /> Reject</Button>
                  </div>
            }
              </div>
          }

            {selected.registrationType === 'dealer' && performance &&
          <div className="mt-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Performance (live from transactions)</p>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Total sales" value={formatCurrency(performance.totalSales)} icon={WalletIcon} />
                  <StatCard label="Sales this month" value={formatCurrency(performance.salesThisMonth)} icon={WalletIcon} />
                  <StatCard label="Outstanding" value={formatCurrency(performance.totalOutstanding)} icon={WalletIcon} />
                  <StatCard label="Overdue" value={formatCurrency(performance.overdueAmount)} icon={AlertTriangleIcon} />
                  <StatCard label="Credit utilization" value={performance.creditUtilizationPct === null ? '—' : `${performance.creditUtilizationPct}%`} icon={WalletIcon} />
                  <StatCard label="Return ratio" value={performance.returnRatioPct === null ? '—' : `${performance.returnRatioPct}%`} icon={AlertTriangleIcon} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-gray dark:text-slate-400 sm:grid-cols-4">
                  <p>Sales orders: {performance.salesOrderCount}</p>
                  <p>Invoices: {performance.invoiceCount}</p>
                  <p>Cheque returns: {performance.chequeReturnsCount}</p>
                  <p>Returned invoices: {performance.returnedInvoiceCount}</p>
                  <p>Credit notes: {performance.creditNotesCount === null ? 'not available' : performance.creditNotesCount}</p>
                  <p>Debit notes: {performance.debitNotesCount === null ? 'not available' : performance.debitNotesCount}</p>
                </div>
              </div>
          }

            {selected.status === 'Blocked' &&
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                This customer is blocked — new quotations, sales orders, and invoices cannot be created for them.
              </div>
          }

            {(selected.billingAddress || selected.shippingAddress) &&
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {selected.billingAddress &&
            <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Billing address</p>
                    <p className="text-sm text-text-gray dark:text-slate-400">{selected.billingAddress}</p>
                  </div>
            }
                {selected.shippingAddress &&
            <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Shipping address</p>
                    <p className="text-sm text-text-gray dark:text-slate-400">{selected.shippingAddress}</p>
                  </div>
            }
              </div>
          }

            <div className="mt-4 flex flex-wrap gap-2">
              {selected.tags.map((t) => <Badge key={t} tone={TAG_TONE[t] || 'gray'}>{t}</Badge>)}
              {isCreditEligible(selected.type) && selected.discountPct > 0 && <Badge tone="green">{selected.discountPct}% discount</Badge>}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl border border-border-soft px-3 py-2.5 dark:border-slate-800">
              <div>
                <p className="text-sm font-semibold text-navy dark:text-slate-100">Customer portal</p>
                <p className="text-xs text-text-gray dark:text-slate-400">
                  {selected.hasPortalAccount ? 'Portal access enabled' : 'No portal access yet'}
                </p>
              </div>
              <Button variant="secondary" onClick={handleActivatePortal} loading={activatingPortal}>
                {selected.hasPortalAccount ? 'Reset password' : 'Enable access'}
              </Button>
            </div>

            {salespersons.length > 0 &&
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border-soft px-3 py-2.5 dark:border-slate-800">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy dark:text-slate-100">Assigned salesperson</p>
                  <p className="truncate text-xs text-text-gray dark:text-slate-400">
                    {assignment ? `${assignment.salespersonName ?? ''}${assignment.salespersonCode ? ` (${assignment.salespersonCode})` : ''}` : 'No salesperson assigned'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Select value={assignSalespersonId} onChange={(e) => setAssignSalespersonId(e.target.value)} className="w-40">
                    <option value="">— none —</option>
                    {salespersons.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                  </Select>
                  <Button
                variant="secondary"
                size="sm"
                loading={savingAssignment}
                disabled={!assignSalespersonId || assignSalespersonId === assignment?.salespersonId}
                onClick={saveAssignment}>

                    Save
                  </Button>
                </div>
              </div>
          }

            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-soft-gray p-3 dark:bg-slate-800/60">
                <p className="text-xs font-semibold text-text-gray dark:text-slate-400">Visits</p>
                <p className="mt-0.5 text-lg font-extrabold text-navy dark:text-slate-100">{selected.visits}</p>
              </div>
              {loyaltyEnabled &&
            <div className="rounded-xl bg-soft-gray p-3 dark:bg-slate-800/60">
                  <p className="text-xs font-semibold text-text-gray dark:text-slate-400">Loyalty</p>
                  <p className="mt-0.5 text-lg font-extrabold text-amber-500">{selected.loyaltyPoints}</p>
                </div>
            }
              <div className="rounded-xl bg-soft-gray p-3 dark:bg-slate-800/60">
                <p className="text-xs font-semibold text-text-gray dark:text-slate-400">Spend</p>
                <p className="mt-0.5 text-lg font-extrabold text-navy dark:text-slate-100">{formatCurrency(selected.totalSpend)}</p>
              </div>
            </div>

            {loyaltyEnabled && rewards.length > 0 &&
          <div className="mt-4 flex items-center gap-2">
                <Select value={redeemRewardId} onChange={(e) => setRedeemRewardId(e.target.value)} className="flex-1">
                  <option value="">Redeem a reward…</option>
                  {rewards.map((r) => <option key={r.id} value={r.id} disabled={selected.loyaltyPoints < r.pointsCost}>{r.name} — {r.pointsCost} pts</option>)}
                </Select>
                <Button variant="secondary" onClick={handleRedeem} loading={redeeming} disabled={!redeemRewardId}>Redeem</Button>
              </div>
          }

            {selected.type === 'corporate' && statement &&
          <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Corporate account</p>
                  <button type="button" onClick={() => exportStatementCsv(selected, statement)} className="flex items-center gap-1 text-xs font-semibold text-royal hover:underline dark:text-blue-300">
                    <DownloadIcon className="h-3.5 w-3.5" /> Export statement
                  </button>
                </div>
                {statement.isInViolation &&
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    This account has exceeded its {selected.creditPeriodDays}-day credit period — discount is currently suspended until settled.
                  </div>
            }
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Outstanding" value={formatCurrency(statement.totalOutstanding)} icon={WalletIcon} />
                  <StatCard label="Overdue" value={formatCurrency(statement.overdueAmount)} icon={AlertTriangleIcon} />
                  <StatCard label="On-time rate" value={statement.onTimePaymentRatePct === null || statement.onTimePaymentRatePct === undefined ? '—' : `${statement.onTimePaymentRatePct}%`} icon={WalletIcon} />
                  <StatCard label="Last purchase" value={statement.lastPurchaseDate ? formatDate(statement.lastPurchaseDate) : '—'} icon={WalletIcon} />
                  <StatCard label="Return ratio" value={statement.returnRatioPct === null || statement.returnRatioPct === undefined ? '—' : `${statement.returnRatioPct}%`} icon={AlertTriangleIcon} />
                </div>
                {statement.creditLimit > 0 &&
            <div className="mt-3">
                    <div className="flex justify-between text-xs text-text-gray dark:text-slate-400">
                      <span>Credit used</span>
                      <span>{formatCurrency(statement.totalOutstanding)} / {formatCurrency(statement.creditLimit)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-soft-gray dark:bg-slate-800">
                      <div
                  className={`h-full rounded-full ${statement.totalOutstanding > statement.creditLimit ? 'bg-red-500' : 'bg-teal'}`}
                  style={{ width: `${Math.min(100, (statement.totalOutstanding / statement.creditLimit) * 100)}%` }} />

                    </div>
                  </div>
            }
              </div>
          }

            <div className="mt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Vehicles</p>
              {vehiclesLoading ?
            <p className="text-sm text-text-gray dark:text-slate-400">Loading…</p> :

            <div className="space-y-2">
                  {vehicles.map((v) =>
              <div key={v.id} className="flex items-center justify-between gap-2 rounded-xl border border-border-soft px-3 py-2 text-sm text-navy dark:border-slate-800 dark:text-slate-200">
                      <span className="flex items-center gap-2"><CarIcon className="h-4 w-4 text-teal" /> {v.label}{v.plate ? ` (${v.plate})` : ''}</span>
                      <button type="button" onClick={() => handleRemoveVehicle(v.id)} className="text-red-500 hover:text-red-600">
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
              )}
                  {vehicles.length === 0 && <p className="text-sm text-text-gray dark:text-slate-400">No vehicles yet.</p>}
                </div>
            }
              <div className="mt-2 flex gap-2">
                <Input placeholder="e.g. 2021 Toyota Camry" value={newVehicleLabel} onChange={(e) => setNewVehicleLabel(e.target.value)} />
                <Button type="button" variant="secondary" onClick={handleAddVehicle} loading={addingVehicle}>Add</Button>
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Recent activity</p>
              {historyLoading ?
              <p className="text-sm text-text-gray dark:text-slate-400">Loading…</p> :
              !history || history.timeline.length === 0 ?
              <p className="text-sm text-text-gray dark:text-slate-400">Nothing recorded yet — job cards, invoices, complaints, and calls will show up here.</p> :

              <div className="space-y-1.5">
                  {history.timeline.slice(0, 8).map((event: TimelineEvent) =>
                <div key={`${event.type}-${event.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-border-soft px-3 py-2 text-sm dark:border-slate-800">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-navy dark:text-slate-100">{event.title}</p>
                        <p className="text-xs text-text-gray dark:text-slate-400">{formatDate(event.date)}</p>
                      </div>
                      <Badge tone="gray">{event.status}</Badge>
                    </div>
                )}
                </div>
            }
            </div>
          </div>
        }
      </Modal>

      <Modal
        open={addOpen}
        onClose={closeModal}
        title={editingCustomerId ? 'Edit customer' : 'Add customer'}
        footer={
        <>
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button form="add-customer-form" type="submit" loading={saving}>{editingCustomerId ? 'Save changes' : 'Add customer'}</Button>
          </>
        }>
        <form id="add-customer-form" onSubmit={handleAdd} className="space-y-4">
          {!editingCustomerId &&
          <div>
            <Label htmlFor="cust-registration-type">Register as</Label>
            <Select
              id="cust-registration-type"
              value={registrationType}
              onChange={(e) => {
                const next = e.target.value as RegistrationType;
                setRegistrationType(next);
                if (next === 'dealer') {
                  setAddOpen(false);
                  setDealerModalOpen(true);
                }
              }}>

              <option value="customer">Customer</option>
              <option value="dealer">Dealer</option>
            </Select>
          </div>
          }
          <div>
            <Label htmlFor="cust-name">Full name</Label>
            <Input id="cust-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          {!editingCustomerId &&
          <div>
            <Label htmlFor="cust-email">Email</Label>
            <Input id="cust-email" type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          }
          <div>
            <Label htmlFor="cust-phone">Phone</Label>
            <Input id="cust-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          {!editingCustomerId &&
          <div>
            <Label htmlFor="cust-vehicle">Vehicle</Label>
            <Input id="cust-vehicle" placeholder="e.g. 2021 Toyota Camry" value={form.vehicle} onChange={(e) => setForm((f) => ({ ...f, vehicle: e.target.value }))} />
          </div>
          }

          <div>
            <Label htmlFor="cust-type">Account type</Label>
            <Select id="cust-type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CustomerType }))}>
              <option value="individual">Individual</option>
              <option value="retail">Retail</option>
              {fleetEnabled &&
              <>
                  <option value="corporate">Corporate</option>
                  <option value="wholesale">Wholesale</option>
                </>
              }
            </Select>
          </div>

          <div>
            <Label htmlFor="cust-tax">Tax / VAT number</Label>
            <Input id="cust-tax" value={form.taxNumber} onChange={(e) => setForm((f) => ({ ...f, taxNumber: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="cust-billing-address">Billing address</Label>
            <Input id="cust-billing-address" value={form.billingAddress} onChange={(e) => setForm((f) => ({ ...f, billingAddress: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="cust-shipping-address">Shipping address</Label>
            <Input id="cust-shipping-address" value={form.shippingAddress} onChange={(e) => setForm((f) => ({ ...f, shippingAddress: e.target.value }))} placeholder="Defaults to the billing address" />
          </div>
          {priceLists.length > 0 &&
          <div>
            <Label htmlFor="cust-price-list">Default price list</Label>
            <Select id="cust-price-list" value={form.defaultPriceListId} onChange={(e) => setForm((f) => ({ ...f, defaultPriceListId: e.target.value }))}>
              <option value="">— none (catalog price) —</option>
              {priceLists.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
            </Select>
          </div>
          }
          {editingCustomerId &&
          <div>
            <Label htmlFor="cust-status">Status</Label>
            <Select id="cust-status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as CustomerStatus }))}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Blocked">Blocked</option>
            </Select>
          </div>
          }

          {isCreditEligible(form.type) &&
          <>
              <div>
                <Label htmlFor="cust-contact">Contact person</Label>
                <Input id="cust-contact" value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cust-credit">Credit limit</Label>
                  <Input id="cust-credit" type="number" min={0} value={form.creditLimit} onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="cust-discount">Discount %</Label>
                  <Input id="cust-discount" type="number" min={0} max={100} value={form.discountPct} onChange={(e) => setForm((f) => ({ ...f, discountPct: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label htmlFor="cust-credit-period">Credit period (days)</Label>
                <Input id="cust-credit-period" type="number" min={1} placeholder="30" value={form.creditPeriodDays} onChange={(e) => setForm((f) => ({ ...f, creditPeriodDays: e.target.value }))} />
              </div>
            </>
          }
        </form>
      </Modal>

      <DealerFormModal open={dealerModalOpen} onClose={closeDealerModal} onCreated={handleDealerSaved} editing={editingDealer} />

      <Modal
        open={!!approvalAction}
        onClose={() => setApprovalAction(null)}
        title={approvalAction === 'reject' ? 'Reject dealer' : 'Advance credit approval'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setApprovalAction(null)}>Cancel</Button>
            <Button variant={approvalAction === 'reject' ? 'danger' : 'primary'} onClick={submitApprovalAction} loading={approvalSaving}>
              {approvalAction === 'reject' ? 'Reject' : 'Advance'}
            </Button>
          </>
        }>

        <div className="space-y-4">
          {approvalAction === 'reject' ?
          <div>
              <Label htmlFor="approval-reject-reason">Rejection reason</Label>
              <Input id="approval-reject-reason" required value={approvalForm.rejectionReason} onChange={(e) => setApprovalForm((f) => ({ ...f, rejectionReason: e.target.value }))} />
            </div> :

          <>
              <p className="text-sm text-text-gray dark:text-slate-400">These fields are optional — fill in whichever apply at this step.</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="approval-requested">Requested credit limit</Label>
                  <Input id="approval-requested" type="number" min={0} value={approvalForm.requestedCreditLimit} onChange={(e) => setApprovalForm((f) => ({ ...f, requestedCreditLimit: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="approval-recommended">Recommended credit limit</Label>
                  <Input id="approval-recommended" type="number" min={0} value={approvalForm.recommendedCreditLimit} onChange={(e) => setApprovalForm((f) => ({ ...f, recommendedCreditLimit: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="approval-approved">Approved credit limit</Label>
                  <Input id="approval-approved" type="number" min={0} value={approvalForm.approvedCreditLimit} onChange={(e) => setApprovalForm((f) => ({ ...f, approvedCreditLimit: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="approval-terms">Credit terms</Label>
                  <Input id="approval-terms" placeholder="e.g. 30 Days" value={approvalForm.creditTerms} onChange={(e) => setApprovalForm((f) => ({ ...f, creditTerms: e.target.value }))} />
                </div>
              </div>
            </>
          }
        </div>
      </Modal>
    </div>);

}
