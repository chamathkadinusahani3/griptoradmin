import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ClipboardListIcon,
  AlertTriangleIcon,
  BellRingIcon,
  DollarSignIcon,
  LockIcon,
  SparklesIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronRightIcon } from
'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { useAuth, useHasPermission } from '../../context/AuthContext';
import { MODULES } from '../../data/modules';
import { TenantDashboardSummary } from '../../types/tenantDashboard';
import { formatCurrency } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

export function TenantDashboard() {
  const { user, refreshUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState<TenantDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasingKey, setPurchasingKey] = useState<string | null>(null);
  const canPurchase = useHasPermission('billing:manage');

  useEffect(() => {
    api
      .get<TenantDashboardSummary>('/tenant/dashboard')
      .then(setSummary)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  // Landed back here after a module/add-on purchase checkout
  // (api/tenant/purchase.ts — temporarily disabled while payment providers
  // are being switched, see that file) — refresh the cached user so a
  // newly-unlocked item shows up without a fresh login, same pattern
  // Customers.tsx already uses for its own ?customer= deep link.
  useEffect(() => {
    if (!searchParams.has('purchased')) return;
    refreshUser();
    toast.success('Purchase complete — welcome to your new module!');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('purchased');
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams, refreshUser]);

  const purchase = async (kind: 'module' | 'addon', key: string) => {
    setPurchasingKey(key);
    try {
      const { url } = await api.post<{ url: string }>('/tenant/purchase', { kind, key });
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to start checkout');
      setPurchasingKey(null);
    }
  };

  const activeModules = user?.modules ?? [];
  const activeAddOns = user?.addOns ?? [];

  // Locked items = modules not active + add-ons not purchased
  const lockedModules = MODULES.filter((m) => !activeModules.includes(m.id));
  const lockedAddOns = MODULES.flatMap((m) =>
  m.addOns.
  filter((a) => activeModules.includes(m.id) && !activeAddOns.includes(a.id)).
  map((a) => ({ ...a, moduleName: m.name }))
  );

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0]}`}
        description={`Here's what's happening at ${user?.garageName} today.`} />


      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading || !summary ?
        Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />) :

        <>
            <StatCard label="Open Job Cards" value={String(summary.stats.openJobs)} icon={ClipboardListIcon} hint="in progress" />
            <StatCard label="Low Stock Items" value={String(summary.stats.lowStock)} icon={AlertTriangleIcon} hint="reorder soon" />
            <StatCard label="Upcoming Reminders" value={String(summary.stats.upcomingReminders)} icon={BellRingIcon} hint="scheduled" />
            <StatCard label="This Month's Revenue" value={formatCurrency(summary.stats.revenueThisMonth)} icon={DollarSignIcon} />
          </>
        }
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Active modules summary */}
        <Card className="lg:col-span-2">
          <CardHeader title="Your active modules" subtitle="Open a module to see its own dashboard" />
          {activeModules.length === 0 ?
          <p className="p-5 text-sm text-text-gray dark:text-slate-400">No modules active yet — pick one below to get started.</p> :

          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
            {MODULES.filter((m) => activeModules.includes(m.id)).map((m) =>
            <Link
              key={m.id}
              to={`/app/${m.id}`}
              className="group rounded-xl border border-border-soft p-4 transition hover:border-bright-blue hover:bg-light-blue/40 dark:border-slate-800 dark:hover:bg-slate-800">
                <div className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-griptor-gradient text-xs font-bold text-white">
                    {m.id.slice(0, 3).toUpperCase()}
                  </span>
                  <CheckCircle2Icon className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="mt-2.5 text-sm font-bold text-navy dark:text-slate-100">{m.name}</p>
                <p className="text-xs text-text-gray dark:text-slate-400">{m.tagline}</p>
                <span className="mt-2 flex items-center gap-1 text-xs font-semibold text-bright-blue opacity-0 transition group-hover:opacity-100">
                  Open dashboard <ChevronRightIcon className="h-3.5 w-3.5" />
                </span>
              </Link>
            )}
          </div>
          }
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader title="Quick actions" />
          <div className="space-y-2 p-5">
            {[
            { label: 'Create a job card', to: '/app/gms/jobs' },
            { label: 'Open point of sale', to: '/app/pos/checkout' },
            { label: 'Add a customer', to: '/app/crm/customers' },
            { label: 'Schedule a reminder', to: '/app/crm/reminders' }].
            map((a) =>
            <Link
              key={a.to}
              to={a.to}
              className="flex items-center justify-between rounded-xl border border-border-soft px-4 py-3 text-sm font-semibold text-navy transition hover:border-bright-blue hover:bg-light-blue/40 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800">

                {a.label}
                <ArrowRightIcon className="h-4 w-4 text-bright-blue" />
              </Link>
            )}
          </div>
        </Card>
      </div>

      {/* Available add-ons / upsell */}
      {(lockedModules.length > 0 || lockedAddOns.length > 0) &&
      <Card className="mt-6 overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border-soft bg-griptor-gradient p-5 text-white dark:border-slate-800">
          <SparklesIcon className="h-6 w-6" />
          <div>
            <h3 className="text-base font-bold">Available add-ons</h3>
            <p className="text-sm text-white/85">Unlock more power for {user?.garageName}. Upgrade anytime.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {lockedModules.map((m) =>
          <LockedCard
            key={m.id}
            title={m.name}
            subtitle={m.tagline}
            price={`${formatCurrency(m.price)}/mo`}
            tag="Full module"
            tone="module"
            canPurchase={canPurchase}
            purchasing={purchasingKey === m.id}
            onUpgrade={() => purchase('module', m.id)} />

          )}
          {lockedAddOns.map((a) =>
          <LockedCard
            key={a.id}
            title={a.name}
            subtitle={a.moduleName}
            price={`+${formatCurrency(a.price)}/mo`}
            tag="Add-on"
            tone="addon"
            canPurchase={canPurchase}
            purchasing={purchasingKey === a.id}
            onUpgrade={() => purchase('addon', a.id)} />

          )}
        </div>
      </Card>
      }
    </div>);

}

function LockedCard({
  title,
  subtitle,
  price,
  tag,
  tone,
  canPurchase,
  purchasing,
  onUpgrade




}: {title: string;subtitle: string;price: string;tag: string;tone: 'module' | 'addon';canPurchase: boolean;purchasing: boolean;onUpgrade: () => void;}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-dashed border-border-soft bg-soft-gray/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500">
          <LockIcon className="h-4 w-4" />
        </div>
        <Badge tone={tone === 'module' ? 'purple' : 'teal'}>{tag}</Badge>
      </div>
      <p className="mt-2.5 text-sm font-bold text-navy dark:text-slate-200">{title}</p>
      <p className="line-clamp-1 text-xs text-text-gray dark:text-slate-400">{subtitle}</p>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm font-extrabold text-navy dark:text-slate-100">{price}</span>
        {canPurchase ? (
          <Button size="sm" loading={purchasing} onClick={onUpgrade}>
            Upgrade
          </Button>
        ) : (
          <span className="text-xs text-text-gray dark:text-slate-500">Owner/Manager only</span>
        )}
      </div>
    </div>);

}
