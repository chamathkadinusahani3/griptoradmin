import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ImageIcon, CopyIcon, LockIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Label, Select } from '../../components/ui/Input';
import { Toggle } from '../../components/ui/Toggle';
import { Badge } from '../../components/ui/Badge';
import { BRAND_PALETTES, FONT_OPTIONS, paletteFromAccent } from '../../data/brandPalettes';
import { cn, formatCurrency } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { submitPayHereCheckout } from '../../lib/payhereCheckout';
import { useAuth, useHasPermission } from '../../context/AuthContext';
import { Client } from '../../types/client';
import { PricingTier } from '../../types/pricingTier';

const SELF_SERVE_PLAN_IDS = ['Starter', 'Professional'] as const;
type SelfServePlan = (typeof SELF_SERVE_PLAN_IDS)[number];

/** Downscales an uploaded logo before it's stored as a base64 data URL — same approach as ClientDetail.tsx's super-admin branding editor. */
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

export function Settings() {
  const { refreshUser } = useAuth();
  const canEdit = useHasPermission('settings:edit');

  const [garage, setGarage] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [taxId, setTaxId] = useState('');
  const [website, setWebsite] = useState('');
  const [taxRatePct, setTaxRatePct] = useState('8');
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState('1');
  const [savingFinance, setSavingFinance] = useState(false);
  const [numberingPrefixes, setNumberingPrefixes] = useState({
    invoice: '', quotation: '', purchaseOrder: '', complaint: '', expense: '', return: '',
    purchaseRequisition: '', rfq: '', supplierQuotation: '', grn: '', purchaseInvoice: '',
    salesOrder: '', deliveryNote: '', salaryAdvance: '', warrantyClaim: '', supplierClaim: '',
  });
  const [savingNumbering, setSavingNumbering] = useState(false);
  const [paletteId, setPaletteId] = useState('blue');
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined);
  const [defaultMode, setDefaultMode] = useState<'light' | 'dark'>('light');
  const [accentColor, setAccentColor] = useState<string | undefined>(undefined);
  const [sidebarStyle, setSidebarStyle] = useState<'expanded' | 'compact'>('expanded');
  const [fontFamily, setFontFamily] = useState('Inter');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [settingUpPayment, setSettingUpPayment] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<SelfServePlan | null>(null);
  const [tiers, setTiers] = useState<PricingTier[]>([]);

  useEffect(() => {
    api.get<{ tiers: PricingTier[] }>('/pricing-tiers').then(({ tiers }) => setTiers(tiers)).catch(() => setTiers([]));
  }, []);

  useEffect(() => {
    api
      .get<{ client: Client }>('/tenant/me')
      .then(({ client }) => {
        setGarage(client);
        setName(client.name);
        setContact(client.contact);
        setEmail(client.email);
        setAddress(client.address ?? '');
        setPhone(client.phone ?? '');
        setTaxId(client.taxId ?? '');
        setWebsite(client.website ?? '');
        setPaletteId(client.branding.paletteId);
        setLogoDataUrl(client.branding.logoDataUrl);
        setDefaultMode(client.branding.defaultMode);
        setAccentColor(client.branding.accentColor);
        setSidebarStyle(client.branding.sidebarStyle);
        setFontFamily(client.branding.fontFamily);
        setTaxRatePct(String(client.taxRatePct));
        setFiscalYearStartMonth(String(client.fiscalYearStartMonth));
        setNumberingPrefixes({
          invoice: client.numberingPrefixes.invoice ?? '',
          quotation: client.numberingPrefixes.quotation ?? '',
          purchaseOrder: client.numberingPrefixes.purchaseOrder ?? '',
          complaint: client.numberingPrefixes.complaint ?? '',
          expense: client.numberingPrefixes.expense ?? '',
          return: client.numberingPrefixes.return ?? '',
          purchaseRequisition: client.numberingPrefixes.purchaseRequisition ?? '',
          rfq: client.numberingPrefixes.rfq ?? '',
          supplierQuotation: client.numberingPrefixes.supplierQuotation ?? '',
          grn: client.numberingPrefixes.grn ?? '',
          purchaseInvoice: client.numberingPrefixes.purchaseInvoice ?? '',
          salesOrder: client.numberingPrefixes.salesOrder ?? '',
          deliveryNote: client.numberingPrefixes.deliveryNote ?? '',
          salaryAdvance: client.numberingPrefixes.salaryAdvance ?? '',
          warrantyClaim: client.numberingPrefixes.warrantyClaim ?? '',
          supplierClaim: client.numberingPrefixes.supplierClaim ?? '',
        });
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

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

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const { client: updated } = await api.patch<{ client: Client }>('/tenant/settings', { name, contact, email, address, phone, taxId, website });
      setGarage(updated);
      toast.success('Garage profile updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const saveFinance = async () => {
    setSavingFinance(true);
    try {
      const { client: updated } = await api.patch<{ client: Client }>('/tenant/settings', {
        taxRatePct: Number(taxRatePct),
        fiscalYearStartMonth: Number(fiscalYearStartMonth),
      });
      setGarage(updated);
      await refreshUser();
      toast.success('Finance settings updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update finance settings');
    } finally {
      setSavingFinance(false);
    }
  };

  const saveNumbering = async () => {
    setSavingNumbering(true);
    try {
      const { client: updated } = await api.patch<{ client: Client }>('/tenant/settings', {
        numberingPrefixes: Object.fromEntries(Object.entries(numberingPrefixes).map(([k, v]) => [k, v.toUpperCase()])),
      });
      setGarage(updated);
      setNumberingPrefixes({
        invoice: updated.numberingPrefixes.invoice ?? '',
        quotation: updated.numberingPrefixes.quotation ?? '',
        purchaseOrder: updated.numberingPrefixes.purchaseOrder ?? '',
        complaint: updated.numberingPrefixes.complaint ?? '',
        expense: updated.numberingPrefixes.expense ?? '',
        return: updated.numberingPrefixes.return ?? '',
        purchaseRequisition: updated.numberingPrefixes.purchaseRequisition ?? '',
        rfq: updated.numberingPrefixes.rfq ?? '',
        supplierQuotation: updated.numberingPrefixes.supplierQuotation ?? '',
        grn: updated.numberingPrefixes.grn ?? '',
        purchaseInvoice: updated.numberingPrefixes.purchaseInvoice ?? '',
        salesOrder: updated.numberingPrefixes.salesOrder ?? '',
        deliveryNote: updated.numberingPrefixes.deliveryNote ?? '',
        salaryAdvance: updated.numberingPrefixes.salaryAdvance ?? '',
        warrantyClaim: updated.numberingPrefixes.warrantyClaim ?? '',
        supplierClaim: updated.numberingPrefixes.supplierClaim ?? '',
      });
      toast.success('Document numbering updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update document numbering');
    } finally {
      setSavingNumbering(false);
    }
  };

  const saveBranding = async () => {
    setSavingBranding(true);
    try {
      const { client: updated } = await api.patch<{ client: Client }>('/tenant/settings', {
        branding: {
          paletteId,
          logoDataUrl: logoDataUrl ?? null,
          defaultMode,
          accentColor: paletteId === 'custom' ? accentColor ?? null : undefined,
          sidebarStyle,
          fontFamily,
        },
      });
      setGarage(updated);
      await refreshUser();
      toast.success('Branding updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update branding');
    } finally {
      setSavingBranding(false);
    }
  };

  const startPayment = async (plan: SelfServePlan) => {
    setSettingUpPayment(true);
    try {
      const { actionUrl, fields } = await api.post<{ actionUrl: string; fields: Record<string, string> }>('/tenant/setup-payment', { plan });
      submitPayHereCheckout(actionUrl, fields);
      // Browser is navigating away to PayHere — no need to reset loading state.
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to start payment setup');
      setSettingUpPayment(false);
    }
  };

  if (loading || !garage) return null;

  const currentTier = tiers.find((t) => t.name === garage.plan);
  const isSelfServe = SELF_SERVE_PLAN_IDS.includes(garage.plan as SelfServePlan);
  const isPaying = !!garage.payhereSubscriptionId;
  const otherSelfServePlan: SelfServePlan = garage.plan === 'Starter' ? 'Professional' : 'Starter';
  const trialEndsAt = garage.trialEndsAt ? new Date(garage.trialEndsAt) : null;
  const trialDaysLeft = trialEndsAt ? Math.ceil((trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
  const loginLink = garage.slug ? `${window.location.origin}/login/${garage.slug}` : null;
  const copyLoginLink = () => {
    if (!loginLink) return;
    navigator.clipboard.writeText(loginLink);
    toast.success('Link copied');
  };
  const brandingEnabled = garage.addOns.includes('gms-brand');
  const canEditBranding = canEdit && brandingEnabled;

  return (
    <div>
      <PageHeader title="Settings" description="Your garage's profile and branding" />

      {!canEdit && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          Only an Owner or Manager can change these settings.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Garage profile" subtitle="Shown to your customers and staff" />
          <div className="space-y-4 p-5">
            <div>
              <Label htmlFor="garage-name">Garage name</Label>
              <Input id="garage-name" value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="garage-contact">Contact name</Label>
              <Input id="garage-contact" value={contact} disabled={!canEdit} onChange={(e) => setContact(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="garage-email">Email</Label>
              <Input id="garage-email" type="email" value={email} disabled={!canEdit} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="garage-address">Address (optional)</Label>
              <Input id="garage-address" value={address} disabled={!canEdit} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="garage-phone">Phone (optional)</Label>
              <Input id="garage-phone" value={phone} disabled={!canEdit} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="garage-taxid">Tax / registration ID (optional)</Label>
              <Input id="garage-taxid" value={taxId} disabled={!canEdit} onChange={(e) => setTaxId(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="garage-website">Website (optional)</Label>
              <Input id="garage-website" value={website} disabled={!canEdit} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            {canEdit && (
              <Button loading={savingProfile} onClick={saveProfile}>
                Save profile
              </Button>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Tax &amp; fiscal year" subtitle="Used when computing totals on quotations, invoices, and sales" />
          <div className="space-y-4 p-5">
            <div>
              <Label htmlFor="tax-rate">Tax rate (%)</Label>
              <Input id="tax-rate" type="number" min={0} max={100} step="0.01" value={taxRatePct} disabled={!canEdit} onChange={(e) => setTaxRatePct(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="fiscal-year-start">Fiscal year starts in</Label>
              <Select id="fiscal-year-start" value={fiscalYearStartMonth} disabled={!canEdit} onChange={(e) => setFiscalYearStartMonth(e.target.value)}>
                {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-text-gray dark:text-slate-400">Recorded for future fiscal-year reporting — not yet used by any report.</p>
            </div>
            <div>
              <Label>Currency</Label>
              <p className="rounded-lg border border-border-soft bg-soft-gray px-3 py-2 text-sm text-text-gray dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                {garage.currency ?? 'LKR'} — fixed for now, all pricing and payment collection run in Sri Lankan Rupees.
              </p>
            </div>
            {canEdit && (
              <Button loading={savingFinance} onClick={saveFinance}>
                Save finance settings
              </Button>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Document numbering" subtitle="Prefixes used for auto-generated document numbers, e.g. INV-202607-0001" />
          <div className="space-y-4 p-5">
            {([
              ['invoice', 'Invoices'],
              ['quotation', 'Quotations'],
              ['purchaseOrder', 'Purchase orders'],
              ['complaint', 'Complaints'],
              ['expense', 'Expenses'],
              ['return', 'Returns'],
              ['purchaseRequisition', 'Purchase requisitions'],
              ['rfq', 'RFQs'],
              ['supplierQuotation', 'Supplier quotations'],
              ['grn', 'Goods received notes'],
              ['purchaseInvoice', 'Purchase invoices'],
              ['salesOrder', 'Sales orders'],
              ['deliveryNote', 'Delivery notes'],
              ['salaryAdvance', 'Salary advances'],
              ['warrantyClaim', 'Warranty claims'],
              ['supplierClaim', 'Supplier claims'],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <Label htmlFor={`numbering-${key}`}>{label}</Label>
                <Input
                  id={`numbering-${key}`}
                  placeholder="e.g. INV"
                  maxLength={6}
                  value={numberingPrefixes[key]}
                  disabled={!canEdit}
                  onChange={(e) => setNumberingPrefixes((p) => ({ ...p, [key]: e.target.value.toUpperCase() }))}
                />
              </div>
            ))}
            {canEdit && (
              <Button loading={savingNumbering} onClick={saveNumbering}>
                Save numbering
              </Button>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Branding" subtitle="Your dashboard's color palette, logo, and default theme" />
          {!brandingEnabled && (
            <div className="mx-5 mb-1 flex items-center gap-3 rounded-xl border border-border-soft bg-soft-gray p-3 dark:border-slate-800 dark:bg-slate-800/60">
              <LockIcon className="h-5 w-5 shrink-0 text-text-gray dark:text-slate-400" />
              <div>
                <p className="text-sm font-bold text-navy dark:text-slate-100">Custom Branding isn't enabled</p>
                <p className="text-xs text-text-gray dark:text-slate-400">Ask GRIPTOR to enable the Custom Branding add-on to change your logo, colors, and theme.</p>
              </div>
            </div>
          )}
          <div className="space-y-5 p-5">
            <div>
              <Label>Color palette</Label>
              <div className="grid grid-cols-3 gap-3">
                {BRAND_PALETTES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!canEditBranding}
                    onClick={() => setPaletteId(p.id)}
                    className={cn(
                      'rounded-xl border-2 p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
                      paletteId === p.id
                        ? 'border-teal ring-2 ring-teal/30'
                        : 'border-border-soft hover:border-teal/50 dark:border-slate-800'
                    )}
                  >
                    <div
                      className="h-8 w-full rounded-lg"
                      style={{
                        background: `linear-gradient(135deg, ${p.colors.navy}, ${p.colors.royal}, ${p.colors.teal}, ${p.colors.cyan})`,
                      }}
                    />
                    <p className="mt-1.5 text-xs font-semibold text-navy dark:text-slate-200">{p.label}</p>
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!canEditBranding}
                  onClick={() => setPaletteId('custom')}
                  className={cn(
                    'rounded-xl border-2 p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
                    paletteId === 'custom'
                      ? 'border-teal ring-2 ring-teal/30'
                      : 'border-border-soft hover:border-teal/50 dark:border-slate-800'
                  )}
                >
                  {(() => {
                    const preview = paletteFromAccent(accentColor ?? '#2164B4');
                    return (
                      <div
                        className="h-8 w-full rounded-lg"
                        style={{
                          background: `linear-gradient(135deg, ${preview.colors.navy}, ${preview.colors.royal}, ${preview.colors.teal}, ${preview.colors.cyan})`,
                        }}
                      />
                    );
                  })()}
                  <p className="mt-1.5 text-xs font-semibold text-navy dark:text-slate-200">Custom</p>
                </button>
              </div>
              {paletteId === 'custom' && (
                <div className="mt-3 flex items-center gap-3">
                  <input
                    type="color"
                    aria-label="Custom accent color"
                    disabled={!canEditBranding}
                    value={accentColor ?? '#2164B4'}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-border-soft bg-transparent p-1 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700"
                  />
                  <p className="text-xs text-text-gray dark:text-slate-400">Pick any color — the rest of your dashboard's shades are generated from it.</p>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="logo-input">Logo</Label>
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-soft bg-soft-gray dark:border-slate-800 dark:bg-slate-800">
                  {logoDataUrl ? (
                    <img src={logoDataUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-text-gray dark:text-slate-500" />
                  )}
                </div>
                <div className="flex-1">
                  <input
                    id="logo-input"
                    type="file"
                    accept="image/*"
                    disabled={!canEditBranding}
                    onChange={handleLogoChange}
                    className="block w-full text-sm text-text-gray file:mr-3 file:rounded-lg file:border-0 file:bg-light-blue file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-royal disabled:opacity-60 dark:text-slate-400"
                  />
                  {logoDataUrl && canEditBranding && (
                    <button
                      type="button"
                      onClick={() => setLogoDataUrl(undefined)}
                      className="mt-1.5 text-xs font-semibold text-red-600 hover:underline"
                    >
                      Remove logo
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Default theme</Label>
                <p className="text-xs text-text-gray dark:text-slate-400">First-time appearance for your staff.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-text-gray dark:text-slate-400">
                  {defaultMode === 'dark' ? 'Dark' : 'Light'}
                </span>
                <Toggle checked={defaultMode === 'dark'} disabled={!canEditBranding} onChange={(next) => setDefaultMode(next ? 'dark' : 'light')} />
              </div>
            </div>

            <div>
              <Label htmlFor="font-select">Font</Label>
              <Select id="font-select" value={fontFamily} disabled={!canEditBranding} onChange={(e) => setFontFamily(e.target.value)}>
                {FONT_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id} style={{ fontFamily: f.id }}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="sidebar-style-select">Sidebar style</Label>
              <Select id="sidebar-style-select" value={sidebarStyle} disabled={!canEditBranding} onChange={(e) => setSidebarStyle(e.target.value as 'expanded' | 'compact')}>
                <option value="expanded">Expanded (default)</option>
                <option value="compact">Compact</option>
              </Select>
            </div>

            {canEditBranding && (
              <Button loading={savingBranding} onClick={saveBranding}>
                Save branding
              </Button>
            )}
          </div>
        </Card>

        {loginLink && (
          <Card>
            <CardHeader title="Your admin login link" subtitle="Bookmark this so your staff sign in to a branded page with your logo and colors" />
            <div className="flex items-center gap-2 p-5 pt-0">
              <p className="flex-1 truncate rounded-xl bg-soft-gray px-3 py-2 text-sm text-navy dark:bg-slate-800/60 dark:text-slate-200">{loginLink}</p>
              <Button variant="secondary" onClick={copyLoginLink}><CopyIcon className="h-4 w-4" /> Copy</Button>
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Plan" subtitle="Your subscription with Griptor" />
          <div className="space-y-4 p-5">
            <div className="flex items-center justify-between rounded-xl border border-border-soft p-4 dark:border-slate-800">
              <div>
                <p className="font-bold text-navy dark:text-slate-100">{garage.plan}</p>
                <p className="text-xs text-text-gray dark:text-slate-400">
                  {currentTier?.price != null ? `${formatCurrency(currentTier.price)}/mo` : 'Custom pricing'}
                </p>
              </div>
              <Badge tone="teal">Current plan</Badge>
            </div>

            {isSelfServe && !isPaying && (
              <div className="space-y-3">
                <p className="text-xs text-text-gray dark:text-slate-400">
                  {trialDaysLeft !== null
                    ? trialDaysLeft > 0
                      ? `Trial ends in ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'}.`
                      : 'Trial ended — set up payment to keep using Griptor.'
                    : 'Set up payment to activate your subscription.'}
                </p>
                {canEdit && (
                  <Button loading={settingUpPayment} onClick={() => startPayment(garage.plan as SelfServePlan)}>
                    Set up payment
                  </Button>
                )}
              </div>
            )}

            {isSelfServe && isPaying && (
              <div className="space-y-3">
                <p className="text-xs text-text-gray dark:text-slate-400">Payment is active for this plan.</p>
                {canEdit && switchTarget === null && (
                  <Button variant="secondary" onClick={() => setSwitchTarget(otherSelfServePlan)}>
                    Switch to {otherSelfServePlan}
                  </Button>
                )}
                {canEdit && switchTarget !== null && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                      Switching plans starts a new subscription — your current one will keep charging until you cancel it yourself in PayHere. Contact support if you need help.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" loading={settingUpPayment} onClick={() => startPayment(switchTarget)}>
                        Yes, continue to payment
                      </Button>
                      <Button size="sm" variant="secondary" disabled={settingUpPayment} onClick={() => setSwitchTarget(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!isSelfServe && (
              <p className="text-xs text-text-gray dark:text-slate-400">
                Enterprise plans are custom — <a href="mailto:sales@griptor.com" className="font-semibold text-royal hover:underline dark:text-blue-300">contact sales</a> to make changes.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
