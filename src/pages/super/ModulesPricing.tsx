import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SearchIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Toggle } from '../../components/ui/Toggle';
import { Badge } from '../../components/ui/Badge';
import { Input, Select } from '../../components/ui/Input';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { MODULES } from '../../data/modules';
import { formatCurrency } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { Client } from '../../types/client';

// Composite key so the same feature wording under two different modules
// (e.g. "Digital Inspections" under both gms and vehicle-inspection) never
// collides in Client.disabledCoreFeatures.
const coreFeatureKey = (moduleId: string, feature: string) => `${moduleId}:${feature}`;

export function ModulesPricing() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    api
      .get<{ clients: Client[] }>('/clients')
      .then(({ clients }) => {
        setClients(clients);
        if (clients.length > 0) setSelectedClient(clients[0].id);
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load clients'))
      .finally(() => setLoading(false));
  }, []);

  const client = clients.find((c) => c.id === selectedClient);

  const toggle = async (key: string, label: string, price: number, isModule: boolean) => {
    if (!client) return;
    const isOn = isModule ? client.modules.includes(key) : client.addOns.includes(key);
    const nextModules = isModule
      ? (isOn ? client.modules.filter((m) => m !== key) : [...client.modules, key])
      : client.modules;
    const nextAddOns = isModule
      ? client.addOns
      : (isOn ? client.addOns.filter((a) => a !== key) : [...client.addOns, key]);

    const previous = clients;
    setClients((prev) => prev.map((c) => c.id === client.id ? { ...c, modules: nextModules, addOns: nextAddOns } : c));

    try {
      await api.patch(`/clients/${client.id}`, { modules: nextModules, addOns: nextAddOns });
      toast.success(`${label} ${isOn ? 'disabled' : 'enabled'} for ${client.name}${!isOn && price ? ` (+${formatCurrency(price)}/mo)` : ''}`);
    } catch (err) {
      setClients(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update modules');
    }
  };

  // Core features default to ON — Client.disabledCoreFeatures only ever
  // lists the ones explicitly turned off for this one client.
  const toggleCoreFeature = async (moduleId: string, feature: string) => {
    if (!client) return;
    const key = coreFeatureKey(moduleId, feature);
    const isOn = !client.disabledCoreFeatures.includes(key);
    const next = isOn
      ? [...client.disabledCoreFeatures, key]
      : client.disabledCoreFeatures.filter((k) => k !== key);

    const previous = clients;
    setClients((prev) => prev.map((c) => c.id === client.id ? { ...c, disabledCoreFeatures: next } : c));

    try {
      await api.patch(`/clients/${client.id}`, { disabledCoreFeatures: next });
      toast.success(`${feature} ${isOn ? 'disabled' : 'enabled'} for ${client.name}`);
    } catch (err) {
      setClients(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update core features');
    }
  };

  const countEnabled = (key: string) =>
  clients.filter((c) => c.modules.includes(key) || c.addOns.includes(key)).length;

  const filteredModules = useMemo(
    () => MODULES.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  return (
    <div>
      <PageHeader
        title="Modules & Pricing"
        description="Toggle GRIPTOR's core products and add-ons per client." />


      <Card className="mb-6">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-text-gray dark:text-slate-400">Configuring for:</span>
            <Select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)} className="w-52" aria-label="Select client" disabled={clients.length === 0}>
              {clients.map((c) =>
              <option key={c.id} value={c.id}>{c.name}</option>
              )}
            </Select>
            {client &&
            <Badge tone={client.plan === 'Enterprise' ? 'purple' : client.plan === 'Professional' ? 'teal' : 'gray'}>
              {client.plan}
            </Badge>
            }
          </div>
          <div className="sm:w-64">
            <Input icon={SearchIcon} placeholder="Search modules…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search modules" />
          </div>
        </div>
      </Card>

      {loading ?
      <div className="p-1"><TableSkeleton rows={4} /></div> :
      !client ?
      <Card className="p-8 text-center text-sm text-text-gray dark:text-slate-400">No clients yet — add one from the Clients page first.</Card> :

      <div className="space-y-6">
        {filteredModules.map((mod) => {
          const modOn = client.modules.includes(mod.id);
          return (
            <Card key={mod.id}>
              <div className="flex flex-col gap-4 border-b border-border-soft p-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-griptor-gradient text-sm font-extrabold text-white">
                    {mod.id.toUpperCase()}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-navy dark:text-slate-100">{mod.name}</h3>
                      <span className="text-sm font-bold text-teal">{formatCurrency(mod.price)}/mo</span>
                    </div>
                    <p className="text-sm text-text-gray dark:text-slate-400">{mod.tagline}</p>
                    <p className="mt-1 text-xs text-slate-400">Enabled for {countEnabled(mod.id)} client(s)</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={modOn ? 'green' : 'gray'} dot={modOn}>{modOn ? 'Enabled' : 'Disabled'}</Badge>
                  <Toggle checked={modOn} onChange={() => toggle(mod.id, mod.name, mod.price, true)} label={`Toggle ${mod.name}`} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Core features</p>
                  <div className="space-y-2">
                    {mod.core.map((f) => {
                      const featureOn = !client.disabledCoreFeatures.includes(coreFeatureKey(mod.id, f));
                      return (
                        <div
                          key={f}
                          className="flex items-center justify-between rounded-xl border border-border-soft px-3 py-2 dark:border-slate-800">

                          <p className="text-sm font-semibold text-navy dark:text-slate-200">{f}</p>
                          <Toggle
                            size="sm"
                            checked={featureOn}
                            disabled={!modOn}
                            onChange={() => toggleCoreFeature(mod.id, f)}
                            label={`Toggle ${f}`} />

                        </div>);

                    })}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Add-ons</p>
                  <div className="space-y-2">
                    {mod.addOns.map((a) => {
                      const addOnOn = client.addOns.includes(a.id);
                      return (
                        <div
                          key={a.id}
                          className="flex items-center justify-between rounded-xl border border-border-soft px-3 py-2 dark:border-slate-800">

                          <div>
                            <p className="text-sm font-semibold text-navy dark:text-slate-200">{a.name}</p>
                            <p className="text-xs text-text-gray dark:text-slate-400">+{formatCurrency(a.price)}/mo · {countEnabled(a.id)} clients</p>
                          </div>
                          <Toggle
                            size="sm"
                            checked={addOnOn}
                            disabled={!modOn}
                            onChange={() => toggle(a.id, a.name, a.price, false)}
                            label={`Toggle ${a.name}`} />

                        </div>);

                    })}
                  </div>
                </div>
              </div>
            </Card>);

        })}
      </div>
      }
    </div>);

}
