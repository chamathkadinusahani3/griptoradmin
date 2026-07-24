import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckIcon, PlusIcon, XIcon, PencilIcon, StarIcon, UsersIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label } from '../../components/ui/Input';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { formatCurrency, cn } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { PricingTier } from '../../types/pricingTier';
import { Client } from '../../types/client';

export function Subscriptions() {
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [loadingTiers, setLoadingTiers] = useState(true);
  const [editing, setEditing] = useState<PricingTier | null>(null);
  const [draftFeatures, setDraftFeatures] = useState<string[]>([]);
  const [newFeature, setNewFeature] = useState('');
  const [savingFeatures, setSavingFeatures] = useState(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignClient, setAssignClient] = useState('');
  const [assignPlan, setAssignPlan] = useState('Professional');
  const [assigning, setAssigning] = useState(false);

  const loadTiers = () => {
    setLoadingTiers(true);
    api
      .get<{ tiers: PricingTier[] }>('/pricing-tiers')
      .then(({ tiers }) => setTiers(tiers))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load pricing tiers'))
      .finally(() => setLoadingTiers(false));
  };

  useEffect(loadTiers, []);

  useEffect(() => {
    api
      .get<{ clients: Client[] }>('/clients')
      .then(({ clients }) => {
        setClients(clients);
        if (clients.length > 0) setAssignClient(clients[0].id);
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load clients'));
  }, []);

  const openEdit = (tier: PricingTier) => {
    setEditing(tier);
    setDraftFeatures([...tier.features]);
    setNewFeature('');
  };

  const saveFeatures = async () => {
    if (!editing) return;
    setSavingFeatures(true);
    try {
      await api.patch(`/pricing-tiers/${editing.id}`, { features: draftFeatures });
      setTiers((prev) => prev.map((t) => t.id === editing.id ? { ...t, features: draftFeatures } : t));
      toast.success(`${editing.name} plan features updated`);
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save features');
    } finally {
      setSavingFeatures(false);
    }
  };

  const assignPlanToClient = async () => {
    const client = clients.find((c) => c.id === assignClient);
    if (!client) return;
    setAssigning(true);
    try {
      await api.patch(`/clients/${client.id}`, { plan: assignPlan });
      toast.success(`${client.name} assigned to the ${assignPlan} plan`);
      setAssignOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to assign plan');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        description="Manage GRIPTOR's pricing tiers and assign plans to clients."
        action={
        <Button onClick={() => setAssignOpen(true)} disabled={clients.length === 0}>
            <UsersIcon className="h-4 w-4" /> Assign plan
          </Button>
        } />


      {loadingTiers ?
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div> :

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {tiers.map((tier) =>
        <Card
          key={tier.id}
          className={cn(
            'relative flex flex-col overflow-hidden',
            tier.popular && 'ring-2 ring-bright-blue'
          )}>

            {tier.popular &&
          <div className="absolute right-4 top-4">
                <Badge tone="teal">
                  <StarIcon className="h-3 w-3" /> Most Popular
                </Badge>
              </div>
          }
            <div className="p-6">
              <h3 className="text-lg font-extrabold text-navy dark:text-slate-100">{tier.name}</h3>
              <p className="mt-1 text-sm text-text-gray dark:text-slate-400">{tier.description}</p>
              <div className="mt-4 flex items-end gap-1">
                {tier.price ?
              <>
                    <span className="text-4xl font-extrabold text-navy dark:text-white">{formatCurrency(tier.price)}</span>
                    <span className="mb-1 text-sm text-text-gray dark:text-slate-400">{tier.cadence}</span>
                  </> :

              <span className="text-4xl font-extrabold text-navy dark:text-white">Custom</span>
              }
              </div>
            </div>
            <div className="flex-1 border-t border-border-soft px-6 py-5 dark:border-slate-800">
              <ul className="space-y-3">
                {tier.features.map((f) =>
              <li key={f} className="flex items-start gap-2.5 text-sm text-navy dark:text-slate-200">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-light-blue text-teal dark:bg-teal/20">
                      <CheckIcon className="h-3 w-3" strokeWidth={3} />
                    </span>
                    {f}
                  </li>
              )}
              </ul>
            </div>
            <div className="p-6 pt-0">
              <Button variant="secondary" className="w-full" onClick={() => openEdit(tier)}>
                <PencilIcon className="h-4 w-4" /> Edit features
              </Button>
            </div>
          </Card>
        )}
      </div>
      }

      {/* Edit features modal */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name} features` : ''}
        footer={
        <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={savingFeatures} onClick={saveFeatures}>Save features</Button>
          </>
        }>

        <div className="space-y-2">
          {draftFeatures.map((f, i) =>
          <div key={i} className="flex items-center gap-2 rounded-xl border border-border-soft px-3 py-2 dark:border-slate-800">
              <CheckIcon className="h-4 w-4 shrink-0 text-teal" />
              <span className="flex-1 text-sm text-navy dark:text-slate-200">{f}</span>
              <button
              onClick={() => setDraftFeatures((prev) => prev.filter((_, idx) => idx !== i))}
              aria-label={`Remove ${f}`}
              className="rounded-lg p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10">

                <XIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <Input
            placeholder="Add a feature…"
            value={newFeature}
            onChange={(e) => setNewFeature(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newFeature.trim()) {
                setDraftFeatures((prev) => [...prev, newFeature.trim()]);
                setNewFeature('');
              }
            }} />

          <Button
            variant="secondary"
            onClick={() => {
              if (newFeature.trim()) {
                setDraftFeatures((prev) => [...prev, newFeature.trim()]);
                setNewFeature('');
              }
            }}>

            <PlusIcon className="h-4 w-4" /> Add
          </Button>
        </div>
      </Modal>

      {/* Assign plan modal */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign or change a client's plan"
        footer={
        <>
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button loading={assigning} onClick={assignPlanToClient}>
              Assign plan
            </Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="assign-client">Client</Label>
            <Select id="assign-client" value={assignClient} onChange={(e) => setAssignClient(e.target.value)}>
              {clients.map((c) =>
              <option key={c.id} value={c.id}>{c.name}</option>
              )}
            </Select>
          </div>
          <div>
            <Label htmlFor="assign-plan">Plan</Label>
            <Select id="assign-plan" value={assignPlan} onChange={(e) => setAssignPlan(e.target.value)}>
              {tiers.map((t) =>
              <option key={t.id} value={t.name}>
                  {t.name} {t.price ? `— ${formatCurrency(t.price)}/mo` : '— Custom'}
                </option>
              )}
            </Select>
          </div>
        </div>
      </Modal>
    </div>);

}
