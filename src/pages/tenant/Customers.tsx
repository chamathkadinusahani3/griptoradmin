import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SearchIcon, UsersIcon, StarIcon, CarIcon, PhoneIcon, MailIcon, PlusIcon, BuildingIcon, TrashIcon, DownloadIcon, WalletIcon, AlertTriangleIcon, CopyIcon } from 'lucide-react';
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
import { Customer } from '../../types/customer';
import { Client } from '../../types/client';
import { Vehicle } from '../../types/vehicle';
import { CustomerStatement } from '../../types/statement';
import { LoyaltyReward } from '../../types/loyaltyReward';
import { formatDate, formatCurrency } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const TAG_TONE: Record<string, 'purple' | 'teal' | 'blue' | 'amber' | 'gray' | 'red' | 'green'> = {
  VIP: 'purple',
  Fleet: 'teal',
  Regular: 'blue',
  New: 'green',
  'At Risk': 'red'
};

const emptyForm = {
  name: '', email: '', phone: '', vehicle: '',
  type: 'individual' as 'individual' | 'corporate',
  contactPerson: '', creditLimit: '', discountPct: '', creditPeriodDays: ''
};

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [garage, setGarage] = useState<Client | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const loyaltyEnabled = garage?.addOns.includes('crm-loyalty') ?? false;
  const fleetEnabled = garage?.addOns.includes('gms-fleet') ?? false;

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [newVehicleLabel, setNewVehicleLabel] = useState('');
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [activatingPortal, setActivatingPortal] = useState(false);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [redeemRewardId, setRedeemRewardId] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const loadCustomers = () => {
    setLoading(true);
    api
      .get<{ customers: Customer[] }>('/customers')
      .then(({ customers }) => setCustomers(customers))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load customers'))
      .finally(() => setLoading(false));
  };

  useEffect(loadCustomers, []);

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
      .get<{ client: Client }>('/tenant/me')
      .then(({ client }) => setGarage(client))
      .catch(() => setGarage(null));
    api
      .get<{ rewards: LoyaltyReward[] }>('/loyalty-rewards')
      .then(({ rewards }) => setRewards(rewards.filter((r) => r.active)))
      .catch(() => setRewards([]));
  }, []);

  const portalLink = garage?.slug ? `${window.location.origin}/portal/${garage.slug}` : null;
  const copyPortalLink = () => {
    if (!portalLink) return;
    navigator.clipboard.writeText(portalLink);
    toast.success('Link copied');
  };

  const filtered = useMemo(
    () => customers.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()) || c.email.toLowerCase().includes(query.toLowerCase())),
    [customers, query]
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { customer } = await api.post<{ customer: Customer }>('/customers', {
        name: form.name,
        email: form.email,
        phone: form.phone,
        type: form.type,
        contactPerson: form.type === 'corporate' ? form.contactPerson : undefined,
        creditLimit: form.type === 'corporate' ? Number(form.creditLimit) || 0 : 0,
        discountPct: form.type === 'corporate' ? Number(form.discountPct) || 0 : 0,
        creditPeriodDays: form.type === 'corporate' ? Number(form.creditPeriodDays) || 30 : undefined,
      });
      // First vehicle (if given) becomes a real Vehicle document instead of
      // the legacy free-text `vehicles` array — same field, real storage.
      if (form.vehicle.trim()) {
        await api.post(`/customers/${customer.id}/vehicles`, { label: form.vehicle.trim() });
      }
      toast.success('Customer added');
      setAddOpen(false);
      setForm(emptyForm);
      loadCustomers();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add customer');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!selected) {
      setVehicles([]);
      setStatement(null);
      return;
    }
    setVehiclesLoading(true);
    api
      .get<{ vehicles: Vehicle[] }>(`/customers/${selected.id}/vehicles`)
      .then(({ vehicles }) => setVehicles(vehicles))
      .catch(() => setVehicles([]))
      .finally(() => setVehiclesLoading(false));

    if (selected.type === 'corporate') {
      api
        .get<CustomerStatement>(`/customers/${selected.id}/statement`)
        .then(setStatement)
        .catch(() => setStatement(null));
    } else {
      setStatement(null);
    }
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

  return (
    <div>
      <PageHeader
        title="Customers"
        description={`${customers.length} customers${loyaltyEnabled ? ' · Loyalty & Rewards active' : ''}`}
        action={<Button onClick={() => setAddOpen(true)}><PlusIcon className="h-4 w-4" /> Add customer</Button>} />


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
        <div className="border-b border-border-soft p-4 dark:border-slate-800">
          <Input icon={SearchIcon} placeholder="Search customers…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search customers" />
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
            <div className="flex items-center gap-3">
              <Avatar name={selected.name} size="lg" />
              <div>
                <p className="flex items-center gap-1.5 font-bold text-navy dark:text-slate-100">
                  {selected.name}
                  {selected.type === 'corporate' && <Badge tone="purple"><BuildingIcon className="mr-1 inline h-3 w-3" />Corporate</Badge>}
                </p>
                <p className="flex items-center gap-1 text-sm text-text-gray dark:text-slate-400"><MailIcon className="h-3.5 w-3.5" /> {selected.email}</p>
                {selected.phone && <p className="flex items-center gap-1 text-sm text-text-gray dark:text-slate-400"><PhoneIcon className="h-3.5 w-3.5" /> {selected.phone}</p>}
                {selected.type === 'corporate' && selected.contactPerson && <p className="text-sm text-text-gray dark:text-slate-400">Contact: {selected.contactPerson}</p>}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {selected.tags.map((t) => <Badge key={t} tone={TAG_TONE[t] || 'gray'}>{t}</Badge>)}
              {selected.type === 'corporate' && selected.discountPct > 0 && <Badge tone="green">{selected.discountPct}% discount</Badge>}
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
          </div>
        }
      </Modal>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add customer"
        footer={
        <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button form="add-customer-form" type="submit" loading={saving}>Add customer</Button>
          </>
        }>
        <form id="add-customer-form" onSubmit={handleAdd} className="space-y-4">
          <div>
            <Label htmlFor="cust-name">Full name</Label>
            <Input id="cust-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="cust-email">Email</Label>
            <Input id="cust-email" type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="cust-phone">Phone</Label>
            <Input id="cust-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="cust-vehicle">Vehicle</Label>
            <Input id="cust-vehicle" placeholder="e.g. 2021 Toyota Camry" value={form.vehicle} onChange={(e) => setForm((f) => ({ ...f, vehicle: e.target.value }))} />
          </div>

          {fleetEnabled &&
          <>
              <div>
                <Label htmlFor="cust-type">Account type</Label>
                <Select id="cust-type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as 'individual' | 'corporate' }))}>
                  <option value="individual">Individual</option>
                  <option value="corporate">Corporate</option>
                </Select>
              </div>
              {form.type === 'corporate' &&
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
            </>
          }
        </form>
      </Modal>
    </div>);

}
