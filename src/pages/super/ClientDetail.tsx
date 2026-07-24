import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeftIcon,
  MapPinIcon,
  UsersIcon,
  CalendarIcon,
  MailIcon,
  PackageIcon,
  ReceiptIcon,
  LifeBuoyIcon,
  ActivityIcon,
  ImageIcon } from
'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { StatusBadge } from '../../components/StatusBadge';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Select, Label } from '../../components/ui/Input';
import { Toggle } from '../../components/ui/Toggle';
import { EmptyState } from '../../components/ui/EmptyState';
import { MODULE_BY_ID, PRICING_TIERS } from '../../data/modules';
import { BRAND_PALETTES, getBrandPalette } from '../../data/brandPalettes';
import { formatCurrency, formatDate, cn } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { Client } from '../../types/client';
import { Invoice } from '../../types/invoice';
import { Ticket } from '../../types/ticket';

/** Downscales an uploaded logo to a small square before it's stored as a base64 data URL on the Client doc — keeps documents small since there's no dedicated object storage in this project. */
function resizeImageToDataUrl(file: File, maxDim = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read image'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [planModal, setPlanModal] = useState(false);
  const [plan, setPlan] = useState('Starter');
  const [savingPlan, setSavingPlan] = useState(false);
  const [brandingModal, setBrandingModal] = useState(false);
  const [paletteId, setPaletteId] = useState('blue');
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined);
  const [defaultMode, setDefaultMode] = useState<'light' | 'dark'>('light');
  const [savingBranding, setSavingBranding] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<{ client: Client }>(`/clients/${id}`)
      .then(({ client }) => {
        setClient(client);
        setPlan(client.plan);
        setPaletteId(client.branding.paletteId);
        setLogoDataUrl(client.branding.logoDataUrl);
        setDefaultMode(client.branding.defaultMode);
      })
      .catch(() => setClient(null))
      .finally(() => setLoading(false));

    api
      .get<{ invoices: Invoice[] }>(`/invoices?clientId=${id}`)
      .then(({ invoices }) => setInvoices(invoices))
      .catch(() => setInvoices([]));

    api
      .get<{ tickets: Ticket[] }>(`/tickets?clientId=${id}`)
      .then(({ tickets }) => setTickets(tickets))
      .catch(() => setTickets([]));
  }, [id]);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      if (dataUrl.length > 400_000) {
        toast.error('That image is still too large after resizing — try a simpler logo.');
        return;
      }
      setLogoDataUrl(dataUrl);
    } catch {
      toast.error('Could not read that image file.');
    }
  };

  const handleSaveBranding = async () => {
    if (!client) return;
    setSavingBranding(true);
    try {
      const { client: updated } = await api.patch<{ client: Client }>(`/clients/${client.id}`, {
        branding: { paletteId, logoDataUrl: logoDataUrl ?? null, defaultMode },
      });
      setClient(updated);
      setBrandingModal(false);
      toast.success(`${updated.name}'s branding updated`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update branding');
    } finally {
      setSavingBranding(false);
    }
  };

  if (loading) return null;

  if (!client) {
    return (
      <EmptyState
        icon={PackageIcon}
        title="Client not found"
        description="This account may have been removed."
        action={<Button onClick={() => navigate('/admin/clients')}>Back to clients</Button>} />);


  }

  const usage = [
  { label: 'Job cards this month', value: '148', pct: 74 },
  { label: 'Inventory items', value: '312', pct: 52 },
  { label: 'Active customers', value: '1,204', pct: 88 },
  { label: 'Staff seats used', value: `${client.staff}/15`, pct: client.staff / 15 * 100 }];

  const handleSavePlan = async () => {
    setSavingPlan(true);
    try {
      const { client: updated } = await api.patch<{ client: Client }>(`/clients/${client.id}`, { plan });
      setClient(updated);
      setPlanModal(false);
      toast.success(`${client.name} moved to the ${plan} plan`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to change plan');
    } finally {
      setSavingPlan(false);
    }
  };

  return (
    <div>
      <Link to="/admin/clients" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-royal hover:underline dark:text-blue-300">
        <ArrowLeftIcon className="h-4 w-4" /> Back to clients
      </Link>

      <PageHeader
        title={client.name}
        description={`Managed by ${client.contact}`}
        action={
        <div className="flex items-center gap-3">
            <StatusBadge status={client.status} />
            <Button onClick={() => setPlanModal(true)}>Change plan</Button>
          </div>
        } />


      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
        { icon: PackageIcon, label: 'Plan', value: client.plan },
        { icon: MapPinIcon, label: 'Locations', value: String(client.locations) },
        { icon: UsersIcon, label: 'Staff', value: String(client.staff) },
        { icon: CalendarIcon, label: 'Customer since', value: formatDate(client.signupDate) }].
        map((s) =>
        <Card key={s.label} className="p-4">
            <div className="flex items-center gap-2 text-text-gray dark:text-slate-400">
              <s.icon className="h-4 w-4" />
              <span className="text-xs font-semibold">{s.label}</span>
            </div>
            <p className="mt-2 text-lg font-extrabold text-navy dark:text-slate-100">{s.value}</p>
          </Card>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Active modules */}
          <Card>
            <CardHeader title="Active modules & add-ons" subtitle={`${formatCurrency(client.mrr)}/mo total`} />
            {client.modules.length === 0 ?
            <EmptyState icon={PackageIcon} title="No modules yet" description="This client hasn't been assigned any modules." /> :
            <div className="space-y-3 p-5">
              {client.modules.map((mId) => {
                const mod = MODULE_BY_ID[mId];
                if (!mod) return null;
                const activeAddOns = mod.addOns.filter((a) => client.addOns.includes(a.id));
                return (
                  <div key={mId} className="rounded-xl border border-border-soft p-4 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-griptor-gradient text-xs font-bold text-white">
                          {mId.toUpperCase()}
                        </span>
                        <div>
                          <p className="font-bold text-navy dark:text-slate-100">{mod.name}</p>
                          <p className="text-xs text-text-gray dark:text-slate-400">{formatCurrency(mod.price)}/mo</p>
                        </div>
                      </div>
                      <Badge tone="green" dot>Enabled</Badge>
                    </div>
                    {activeAddOns.length > 0 &&
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-border-soft pt-3 dark:border-slate-800">
                        {activeAddOns.map((a) =>
                      <Badge key={a.id} tone="teal">
                            {a.name} (+{formatCurrency(a.price)})
                          </Badge>
                      )}
                      </div>
                    }
                  </div>);

              })}
            </div>
            }
          </Card>

          {/* Invoices */}
          <Card>
            <CardHeader title="Invoices" subtitle="Billing history" />
            {invoices.length === 0 ?
            <EmptyState icon={ReceiptIcon} title="No invoices yet" description="Invoices appear once billing begins." /> :

            <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                      <th className="px-5 py-3 font-bold">Invoice</th>
                      <th className="px-5 py-3 font-bold">Date</th>
                      <th className="px-5 py-3 font-bold">Amount</th>
                      <th className="px-5 py-3 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) =>
                  <tr key={inv.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                        <td className="px-5 py-3 font-bold text-navy dark:text-slate-100">{inv.id}</td>
                        <td className="px-5 py-3 text-text-gray dark:text-slate-400">{formatDate(inv.date)}</td>
                        <td className="px-5 py-3 font-semibold text-navy dark:text-slate-100">{formatCurrency(inv.amount)}</td>
                        <td className="px-5 py-3"><StatusBadge status={inv.status} /></td>
                      </tr>
                  )}
                  </tbody>
                </table>
              </div>
            }
          </Card>

          {/* Support history */}
          <Card>
            <CardHeader title="Support history" subtitle="Recent tickets" />
            {tickets.length === 0 ?
            <EmptyState icon={LifeBuoyIcon} title="No support tickets" description="This client has a clean support record." /> :

            <ul className="p-5">
                {tickets.map((t) =>
              <li key={t.id} className="flex items-center justify-between border-b border-border-soft py-3 last:border-0 dark:border-slate-800">
                    <div>
                      <p className="font-semibold text-navy dark:text-slate-100">{t.subject}</p>
                      <p className="text-xs text-text-gray dark:text-slate-400">{t.id} · {t.assignee}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={t.priority} dot={false} />
                      <StatusBadge status={t.status} />
                    </div>
                  </li>
              )}
              </ul>
            }
          </Card>
        </div>

        {/* Sidebar column */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Contact" />
            <div className="flex items-center gap-3 px-5 py-4">
              <Avatar name={client.contact} size="lg" />
              <div className="min-w-0">
                <p className="font-bold text-navy dark:text-slate-100">{client.contact}</p>
                <a href={`mailto:${client.email}`} className="flex items-center gap-1 truncate text-sm text-royal hover:underline dark:text-blue-300">
                  <MailIcon className="h-3.5 w-3.5" /> {client.email}
                </a>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Branding"
              subtitle="This tenant's dashboard theme"
              action={<Button size="sm" variant="secondary" onClick={() => setBrandingModal(true)}>Edit</Button>} />
            <div className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-soft bg-soft-gray dark:border-slate-800 dark:bg-slate-800">
                {client.branding.logoDataUrl ?
                <img src={client.branding.logoDataUrl} alt="" className="h-full w-full object-contain" /> :

                <ImageIcon className="h-5 w-5 text-text-gray dark:text-slate-500" />
                }
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-navy dark:text-slate-100">{getBrandPalette(client.branding.paletteId).label}</p>
                <div
                  className="mt-1.5 h-2.5 w-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${getBrandPalette(client.branding.paletteId).colors.navy}, ${getBrandPalette(client.branding.paletteId).colors.teal})`
                  }} />

                <p className="mt-1.5 text-xs text-text-gray dark:text-slate-400">
                  Default mode: {client.branding.defaultMode === 'dark' ? 'Dark' : 'Light'}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Usage stats" subtitle="This billing period" />
            <div className="space-y-4 p-5">
              {usage.map((u) =>
              <div key={u.label}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-text-gray dark:text-slate-400">
                      <ActivityIcon className="h-3.5 w-3.5" /> {u.label}
                    </span>
                    <span className="font-bold text-navy dark:text-slate-100">{u.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-griptor-gradient-soft" style={{ width: `${Math.min(u.pct, 100)}%` }} />
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={planModal}
        onClose={() => setPlanModal(false)}
        title="Change plan"
        footer={
        <>
            <Button variant="secondary" onClick={() => setPlanModal(false)}>Cancel</Button>
            <Button loading={savingPlan} onClick={handleSavePlan}>
              Save changes
            </Button>
          </>
        }>

        <Label htmlFor="plan-select">Select a subscription plan</Label>
        <Select id="plan-select" value={plan} onChange={(e) => setPlan(e.target.value as any)}>
          {PRICING_TIERS.map((t) =>
          <option key={t.id} value={t.name}>
              {t.name} {t.price ? `— ${formatCurrency(t.price)}/mo` : '— Custom'}
            </option>
          )}
        </Select>
        <p className="mt-3 text-sm text-text-gray dark:text-slate-400">
          Changing the plan takes effect on the next billing cycle. The client will be notified by email.
        </p>
      </Modal>

      <Modal
        open={brandingModal}
        onClose={() => setBrandingModal(false)}
        title="Edit branding"
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setBrandingModal(false)}>Cancel</Button>
            <Button loading={savingBranding} onClick={handleSaveBranding}>
              Save changes
            </Button>
          </>
        }>

        <Label>Color palette</Label>
        <div className="grid grid-cols-3 gap-3">
          {BRAND_PALETTES.map((p) =>
          <button
            key={p.id}
            type="button"
            onClick={() => setPaletteId(p.id)}
            className={cn(
              'rounded-xl border-2 p-2 text-left transition',
              paletteId === p.id ?
              'border-teal ring-2 ring-teal/30' :
              'border-border-soft hover:border-teal/50 dark:border-slate-800'
            )}>

              <div
              className="h-8 w-full rounded-lg"
              style={{
                background: `linear-gradient(135deg, ${p.colors.navy}, ${p.colors.royal}, ${p.colors.teal}, ${p.colors.cyan})`
              }} />

              <p className="mt-1.5 text-xs font-semibold text-navy dark:text-slate-200">{p.label}</p>
            </button>
          )}
        </div>

        <div className="mt-5">
          <Label htmlFor="logo-input">Logo</Label>
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-soft bg-soft-gray dark:border-slate-800 dark:bg-slate-800">
              {logoDataUrl ?
              <img src={logoDataUrl} alt="" className="h-full w-full object-contain" /> :

              <ImageIcon className="h-5 w-5 text-text-gray dark:text-slate-500" />
              }
            </div>
            <div className="flex-1">
              <input
                id="logo-input"
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="block w-full text-sm text-text-gray file:mr-3 file:rounded-lg file:border-0 file:bg-light-blue file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-royal dark:text-slate-400" />

              {logoDataUrl &&
              <button
                type="button"
                onClick={() => setLogoDataUrl(undefined)}
                className="mt-1.5 text-xs font-semibold text-red-600 hover:underline">

                  Remove logo
                </button>
              }
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div>
            <Label>Default theme</Label>
            <p className="text-xs text-text-gray dark:text-slate-400">First-time appearance for this tenant's users.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-text-gray dark:text-slate-400">
              {defaultMode === 'dark' ? 'Dark' : 'Light'}
            </span>
            <Toggle checked={defaultMode === 'dark'} onChange={(next) => setDefaultMode(next ? 'dark' : 'light')} />
          </div>
        </div>
      </Modal>
    </div>);

}
