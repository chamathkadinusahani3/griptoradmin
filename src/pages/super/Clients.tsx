import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchIcon, BuildingIcon, ChevronRightIcon, DownloadIcon, PlusIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Input, Label, Select } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { ClientStatus } from '../../data/superAdminData';
import { MODULE_BY_ID } from '../../data/modules';
import { formatCurrency, formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { Client } from '../../types/client';
import { PricingTier } from '../../types/pricingTier';
import { toast } from 'sonner';

const emptyForm = {
  name: '',
  contact: '',
  email: '',
  password: '',
  plan: 'Starter',
  status: 'Trial' as const,
  locations: 1,
  staff: 1,
};

export function Clients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ClientStatus | 'All'>('All');
  const [plan, setPlan] = useState('All');
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadClients = () => {
    setLoading(true);
    api
      .get<{ clients: Client[] }>('/clients')
      .then(({ clients }) => setClients(clients))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load clients'))
      .finally(() => setLoading(false));
  };

  useEffect(loadClients, []);

  useEffect(() => {
    api.get<{ tiers: PricingTier[] }>('/pricing-tiers').then(({ tiers }) => setTiers(tiers)).catch(() => setTiers([]));
  }, []);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const matchesQuery =
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.contact.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = status === 'All' || c.status === status;
      const matchesPlan = plan === 'All' || c.plan === plan;
      return matchesQuery && matchesStatus && matchesPlan;
    });
  }, [clients, query, status, plan]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/clients', form);
      toast.success(`${form.name} added`);
      setAddOpen(false);
      setForm(emptyForm);
      loadClients();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add client');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Clients"
        description="All garage accounts on the GRIPTOR platform."
        action={
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="md" onClick={() => toast.success('Export started — CSV will download shortly')}>
              <DownloadIcon className="h-4 w-4" /> Export
            </Button>
            <Button size="md" onClick={() => setAddOpen(true)}>
              <PlusIcon className="h-4 w-4" /> Add Client
            </Button>
          </div>
        } />


      <Card>
        <div className="flex flex-col gap-3 border-b border-border-soft p-4 dark:border-slate-800 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              icon={SearchIcon}
              placeholder="Search by garage or contact…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search clients" />

          </div>
          <div className="flex gap-3">
            <Select value={status} onChange={(e) => setStatus(e.target.value as any)} aria-label="Filter by status" className="w-36">
              <option value="All">All statuses</option>
              <option value="Active">Active</option>
              <option value="Trial">Trial</option>
              <option value="Suspended">Suspended</option>
            </Select>
            <Select value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Filter by plan" className="w-40">
              <option value="All">All plans</option>
              {tiers.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
            </Select>
          </div>
        </div>

        {loading ?
        <div className="p-5">
            <TableSkeleton rows={7} />
          </div> :
        filtered.length === 0 ?
        <EmptyState icon={BuildingIcon} title="No clients found" description="Try adjusting your search or filters." /> :

        <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Garage</th>
                  <th className="px-5 py-3 font-bold">Plan</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold">Modules</th>
                  <th className="px-5 py-3 font-bold">Signup</th>
                  <th className="px-5 py-3 text-right font-bold">MRR</th>
                  <th className="w-10 px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) =>
              <tr
                key={c.id}
                onClick={() => navigate(`/admin/clients/${c.id}`)}
                className="group cursor-pointer border-b border-border-soft transition last:border-0 hover:bg-soft-gray dark:border-slate-800 dark:hover:bg-slate-800/50">

                    <td className="px-5 py-4">
                      <p className="font-bold text-navy dark:text-slate-100">{c.name}</p>
                      <p className="text-xs text-text-gray dark:text-slate-400">{c.contact}</p>
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={c.plan === 'Enterprise' ? 'purple' : c.plan === 'Professional' ? 'teal' : 'gray'}>
                        {c.plan}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {c.modules.map((m) =>
                    <span
                      key={m}
                      className="rounded-md bg-light-blue px-1.5 py-0.5 text-[11px] font-semibold text-teal dark:bg-teal/15 dark:text-cyan"
                      title={MODULE_BY_ID[m]?.name}>

                            {m.toUpperCase()}
                          </span>
                    )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-text-gray dark:text-slate-400">{formatDate(c.signupDate)}</td>
                    <td className="px-5 py-4 text-right font-bold text-navy dark:text-slate-100">
                      {c.mrr > 0 ? formatCurrency(c.mrr) : '—'}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <ChevronRightIcon className="h-4 w-4 text-slate-300 transition group-hover:text-bright-blue" />
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        }
      </Card>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add client"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button form="add-client-form" type="submit" loading={saving}>Add client</Button>
          </>
        }>
        <form id="add-client-form" onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label htmlFor="c-name">Garage name</Label>
            <Input id="c-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="c-contact">Contact person</Label>
            <Input id="c-contact" required value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="c-email">Email</Label>
            <Input id="c-email" type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="c-password">Initial password</Label>
            <Input id="c-password" type="password" required minLength={8} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="c-plan">Plan</Label>
              <Select id="c-plan" value={form.plan} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}>
                {tiers.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="c-status">Status</Label>
              <Select id="c-status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as any }))}>
                <option value="Trial">Trial</option>
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="c-locations">Locations</Label>
              <Input id="c-locations" type="number" min={1} required value={form.locations} onChange={(e) => setForm((f) => ({ ...f, locations: Number(e.target.value) }))} />
            </div>
            <div>
              <Label htmlFor="c-staff">Staff</Label>
              <Input id="c-staff" type="number" min={1} required value={form.staff} onChange={(e) => setForm((f) => ({ ...f, staff: Number(e.target.value) }))} />
            </div>
          </div>
        </form>
      </Modal>
    </div>);

}
