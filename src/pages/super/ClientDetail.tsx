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
  ImageIcon,
  CopyIcon,
  LogInIcon,
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  KeyIcon,
  PowerIcon,
  ShieldIcon } from
'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { StatusBadge } from '../../components/StatusBadge';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label } from '../../components/ui/Input';
import { Toggle } from '../../components/ui/Toggle';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { MODULE_BY_ID } from '../../data/modules';
import { BRAND_PALETTES, resolveBrandPalette } from '../../data/brandPalettes';
import { formatCurrency, formatDate, cn } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Client } from '../../types/client';
import { Invoice } from '../../types/invoice';
import { Ticket } from '../../types/ticket';
import { PricingTier } from '../../types/pricingTier';
import { TenantUser } from '../../types/tenantUser';
import { Role } from '../../types/role';

/** Downscales an uploaded logo to a small square before it's stored as a base64 data URL on the Client doc — keeps documents small since there's no dedicated object storage in this project. */
function titleCase(word: string): string {
  return word.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function groupPermissions(permissions: string[]): { resource: string; keys: string[] }[] {
  const byResource = new Map<string, string[]>();
  for (const p of permissions) {
    const [resource] = p.split(':');
    byResource.set(resource, [...(byResource.get(resource) ?? []), p]);
  }
  return [...byResource.entries()]
    .map(([resource, keys]) => ({ resource, keys: keys.sort() }))
    .sort((a, b) => a.resource.localeCompare(b.resource));
}

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
  const { user, refreshUser } = useAuth();
  const canImpersonate = user?.teamRole !== 'Billing';
  const [impersonating, setImpersonating] = useState(false);
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
  const [tiers, setTiers] = useState<PricingTier[]>([]);

  const [tab, setTab] = useState<'overview' | 'users'>('overview');
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [tenantRoles, setTenantRoles] = useState<Role[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<TenantUser | null>(null);
  const [userForm, setUserForm] = useState({ name: '', email: '', phone: '', roleId: '', status: 'Invited' as 'Active' | 'Invited', password: '' });
  const [savingUser, setSavingUser] = useState(false);
  const [roleDepartmentFilter, setRoleDepartmentFilter] = useState('');
  const [tempPasswordResult, setTempPasswordResult] = useState<{ name: string; password: string } | null>(null);
  const [permissionsCatalog, setPermissionsCatalog] = useState<string[]>([]);
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [permTargetUser, setPermTargetUser] = useState<TenantUser | null>(null);
  const [permSelection, setPermSelection] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);

  useEffect(() => {
    api.get<{ tiers: PricingTier[] }>('/pricing-tiers').then(({ tiers }) => setTiers(tiers)).catch(() => setTiers([]));
  }, []);

  const loadUsers = () => {
    if (!id) return;
    setUsersLoading(true);
    Promise.all([
      api.get<{ users: TenantUser[] }>(`/clients/${id}/users`),
      api.get<{ roles: Role[] }>(`/clients/${id}/roles`),
      api.get<{ permissions: string[] }>(`/clients/${id}/permissions`)])
    .then(([{ users }, { roles }, { permissions }]) => {
      setTenantUsers(users);
      setTenantRoles(roles);
      setPermissionsCatalog(permissions);
      setUsersLoaded(true);
    }).
    catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load users')).
    finally(() => setUsersLoading(false));
  };

  useEffect(() => {
    if (tab === 'users' && !usersLoaded) loadUsers();
  }, [tab, usersLoaded]);

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

  const handleImpersonate = async () => {
    if (!client) return;
    setImpersonating(true);
    try {
      await api.post(`/clients/${client.id}/impersonate`);
      await refreshUser();
      navigate('/app');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to start impersonation');
    } finally {
      setImpersonating(false);
    }
  };

  const assignableRoles = tenantRoles.filter((r) => !r.isProtectedOwner).sort((a, b) => a.name.localeCompare(b.name));
  const roleDepartments = [...new Set(assignableRoles.map((r) => r.department).filter((d): d is string => !!d))].sort((a, b) => a.localeCompare(b));
  const emptyUserForm = { name: '', email: '', phone: '', roleId: assignableRoles[0]?.id ?? '', status: 'Invited' as 'Active' | 'Invited', password: '' };

  const visibleRoles = assignableRoles.filter((r) => !roleDepartmentFilter || r.department === roleDepartmentFilter);
  // Always keep the currently-selected role visible even if the filters
  // would otherwise hide it — a native <select> shows blank (not an error)
  // when its value has no matching <option>, which reads as data loss.
  const roleOptions = visibleRoles.some((r) => r.id === userForm.roleId) || !userForm.roleId ?
  visibleRoles :
  [...visibleRoles, ...assignableRoles.filter((r) => r.id === userForm.roleId)];

  const openCreateUser = () => {
    setEditingUser(null);
    setUserForm(emptyUserForm);
    setRoleDepartmentFilter('');
    setUserModalOpen(true);
  };

  const openEditUser = (u: TenantUser) => {
    setEditingUser(u);
    setUserForm({ name: u.name, email: u.email, phone: u.phone ?? '', roleId: u.roleId ?? '', status: u.status === 'Deactivated' ? 'Active' : u.status, password: '' });
    setRoleDepartmentFilter('');
    setUserModalOpen(true);
  };

  const saveUser = async () => {
    if (!id || !userForm.name.trim() || !userForm.email.trim() || !userForm.roleId) return;
    setSavingUser(true);
    try {
      if (editingUser) {
        const { member } = await api.patch<{ member: TenantUser }>(`/clients/${id}/users/${editingUser.id}`, {
          name: userForm.name,
          email: userForm.email,
          phone: userForm.phone || undefined,
          roleId: userForm.roleId,
        });
        setTenantUsers((prev) => prev.map((u) => (u.id === member.id ? member : u)));
        toast.success(`${member.name} updated`);
      } else {
        const { member, tempPassword } = await api.post<{ member: TenantUser; tempPassword?: string }>(`/clients/${id}/users`, {
          name: userForm.name,
          email: userForm.email,
          phone: userForm.phone || undefined,
          roleId: userForm.roleId,
          status: userForm.status,
          password: userForm.password || undefined,
        });
        setTenantUsers((prev) => [...prev, member]);
        toast.success(`${member.name} created`);
        if (tempPassword) setTempPasswordResult({ name: member.name, password: tempPassword });
      }
      setUserModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save user');
    } finally {
      setSavingUser(false);
    }
  };

  const toggleActive = async (u: TenantUser) => {
    if (!id) return;
    const nextStatus = u.status === 'Deactivated' ? 'Active' : 'Deactivated';
    const previous = tenantUsers;
    setTenantUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: nextStatus } : x)));
    try {
      const { member } = await api.patch<{ member: TenantUser }>(`/clients/${id}/users/${u.id}`, { status: nextStatus });
      setTenantUsers((prev) => prev.map((x) => (x.id === member.id ? member : x)));
      toast.success(`${member.name} ${nextStatus === 'Deactivated' ? 'deactivated' : 'activated'}`);
    } catch (err) {
      setTenantUsers(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update status');
    }
  };

  const resetPassword = async (u: TenantUser) => {
    if (!id) return;
    try {
      const { tempPassword } = await api.post<{ tempPassword: string }>(`/clients/${id}/users/${u.id}/reset-password`);
      setTempPasswordResult({ name: u.name, password: tempPassword });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to reset password');
    }
  };

  const removeUser = async (u: TenantUser) => {
    if (!id) return;
    const previous = tenantUsers;
    setTenantUsers((prev) => prev.filter((x) => x.id !== u.id));
    try {
      await api.delete(`/clients/${id}/users/${u.id}`);
      toast.success(`${u.name} removed`);
    } catch (err) {
      setTenantUsers(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove user');
    }
  };

  const openPermissions = (u: TenantUser) => {
    setPermTargetUser(u);
    setPermSelection(u.permissions ?? []);
    setPermModalOpen(true);
  };

  const togglePermission = (key: string) => {
    setPermSelection((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  };

  const savePermissions = async () => {
    if (!id || !permTargetUser) return;
    setSavingPerms(true);
    try {
      const { member } = await api.patch<{ member: TenantUser }>(`/clients/${id}/users/${permTargetUser.id}`, {
        permissionOverrides: permSelection,
      });
      setTenantUsers((prev) => prev.map((x) => (x.id === member.id ? member : x)));
      toast.success(`${member.name}'s permissions updated`);
      setPermModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update permissions');
    } finally {
      setSavingPerms(false);
    }
  };

  const resetPermissionsToRole = async () => {
    if (!id || !permTargetUser) return;
    setSavingPerms(true);
    try {
      const { member } = await api.patch<{ member: TenantUser }>(`/clients/${id}/users/${permTargetUser.id}`, {
        permissionOverrides: null,
      });
      setTenantUsers((prev) => prev.map((x) => (x.id === member.id ? member : x)));
      toast.success(`${member.name} reverted to their role's default permissions`);
      setPermModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to reset permissions');
    } finally {
      setSavingPerms(false);
    }
  };

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

  const loginLink = client.slug ? `${window.location.origin}/login/${client.slug}` : null;
  const copyLoginLink = () => {
    if (!loginLink) return;
    navigator.clipboard.writeText(loginLink);
    toast.success('Link copied');
  };

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
            {canImpersonate &&
            <Button variant="secondary" loading={impersonating} onClick={handleImpersonate}>
                <LogInIcon className="h-4 w-4" /> Impersonate
              </Button>
            }
            <Button onClick={() => setPlanModal(true)}>Change plan</Button>
          </div>
        } />


      <div className="mb-6 flex gap-2 border-b border-border-soft dark:border-slate-800">
        <button
          onClick={() => setTab('overview')}
          className={`border-b-2 px-3 py-2 text-sm font-semibold transition ${tab === 'overview' ? 'border-teal text-teal' : 'border-transparent text-text-gray hover:text-navy dark:text-slate-400 dark:hover:text-slate-100'}`}>

          Overview
        </button>
        <button
          onClick={() => setTab('users')}
          className={`border-b-2 px-3 py-2 text-sm font-semibold transition ${tab === 'users' ? 'border-teal text-teal' : 'border-transparent text-text-gray hover:text-navy dark:text-slate-400 dark:hover:text-slate-100'}`}>

          Users
        </button>
      </div>

      {tab === 'overview' &&
      <>
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
                <p className="font-bold text-navy dark:text-slate-100">{resolveBrandPalette(client.branding).label}</p>
                <div
                  className="mt-1.5 h-2.5 w-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${resolveBrandPalette(client.branding).colors.navy}, ${resolveBrandPalette(client.branding).colors.teal})`
                  }} />

                <p className="mt-1.5 text-xs text-text-gray dark:text-slate-400">
                  Default mode: {client.branding.defaultMode === 'dark' ? 'Dark' : 'Light'}
                </p>
              </div>
            </div>
            {loginLink && (
              <div className="flex items-center gap-2 px-5 pb-5">
                <p className="flex-1 truncate rounded-xl bg-soft-gray px-3 py-2 text-xs text-navy dark:bg-slate-800/60 dark:text-slate-200">{loginLink}</p>
                <Button size="sm" variant="secondary" onClick={copyLoginLink}><CopyIcon className="h-4 w-4" /> Copy</Button>
              </div>
            )}
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
      </>
      }

      {tab === 'users' &&
      <Card>
        <CardHeader
          title="Users"
          subtitle={`${tenantUsers.length} user${tenantUsers.length === 1 ? '' : 's'} at ${client.name}`}
          action={<Button onClick={openCreateUser} disabled={assignableRoles.length === 0}><PlusIcon className="h-4 w-4" /> Create User</Button>} />

        {usersLoading ?
        <div className="p-5"><TableSkeleton rows={5} /></div> :
        tenantUsers.length === 0 ?
        <EmptyState icon={UsersIcon} title="No users yet" description="Create the first staff account for this tenant." /> :

        <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3 font-bold">Name</th>
                  <th className="px-5 py-3 font-bold">Email</th>
                  <th className="px-5 py-3 font-bold">Role</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold">Last login</th>
                  <th className="px-5 py-3 font-bold">Created</th>
                  <th className="px-5 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenantUsers.map((u) =>
              <tr key={u.id} className="border-b border-border-soft last:border-0 dark:border-slate-800">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={u.name} size="sm" />
                        <span className="font-bold text-navy dark:text-slate-100">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{u.email}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        {u.roleName && <Badge tone={u.isOwner ? 'purple' : 'teal'}>{u.roleName}</Badge>}
                        {u.hasCustomPermissions && <Badge tone="amber">Custom access</Badge>}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={u.status === 'Active' ? 'green' : u.status === 'Deactivated' ? 'red' : 'amber'}>{u.status}</Badge>
                    </td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}</td>
                    <td className="px-5 py-3 text-text-gray dark:text-slate-400">{u.createdAt ? formatDate(u.createdAt) : '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEditUser(u)} aria-label={`Edit ${u.name}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button onClick={() => resetPassword(u)} aria-label={`Reset ${u.name}'s password`} className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">
                          <KeyIcon className="h-4 w-4" />
                        </button>
                        {!u.isOwner &&
                    <button onClick={() => openPermissions(u)} aria-label={`Edit ${u.name}'s permissions`} className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">
                            <ShieldIcon className="h-4 w-4" />
                          </button>
                    }
                        {!u.isOwner &&
                    <button onClick={() => toggleActive(u)} aria-label={`${u.status === 'Deactivated' ? 'Activate' : 'Deactivate'} ${u.name}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">
                            <PowerIcon className="h-4 w-4" />
                          </button>
                    }
                        {!u.isOwner &&
                    <button onClick={() => removeUser(u)} aria-label={`Remove ${u.name}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10">
                            <Trash2Icon className="h-4 w-4" />
                          </button>
                    }
                      </div>
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        }
      </Card>
      }

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
        <Select id="plan-select" value={plan} onChange={(e) => setPlan(e.target.value)}>
          {tiers.map((t) =>
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

      <Modal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title={editingUser ? `Edit ${editingUser.name}` : 'Create user'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setUserModalOpen(false)}>Cancel</Button>
            <Button loading={savingUser} onClick={saveUser} disabled={!userForm.name.trim() || !userForm.email.trim() || !userForm.roleId}>Save</Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="tu-name">Full name</Label>
            <Input id="tu-name" value={userForm.name} onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="tu-email">Email address</Label>
            <Input id="tu-email" type="email" icon={MailIcon} value={userForm.email} onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="tu-phone">Phone (optional)</Label>
            <Input id="tu-phone" value={userForm.phone} onChange={(e) => setUserForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="tu-role-department">Department</Label>
            <Select id="tu-role-department" value={roleDepartmentFilter} onChange={(e) => setRoleDepartmentFilter(e.target.value)}>
              <option value="">All departments</option>
              {roleDepartments.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="tu-role">Role</Label>
            <Select id="tu-role" value={userForm.roleId} onChange={(e) => setUserForm((f) => ({ ...f, roleId: e.target.value }))}>
              {roleOptions.length === 0 && <option value="">No roles in this department</option>}
              {roleOptions.map((r) => <option key={r.id} value={r.id}>{r.name}{r.department ? ` — ${r.department}` : ''}</option>)}
            </Select>
          </div>
          {!editingUser &&
          <>
              <div>
                <Label htmlFor="tu-status">Status</Label>
                <Select id="tu-status" value={userForm.status} onChange={(e) => setUserForm((f) => ({ ...f, status: e.target.value as 'Active' | 'Invited' }))}>
                  <option value="Invited">Invited</option>
                  <option value="Active">Active</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="tu-password">Temporary password (optional)</Label>
                <Input id="tu-password" type="password" minLength={8} placeholder="Leave blank to auto-generate one" value={userForm.password} onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))} />
                <p className="mt-1 text-xs text-text-gray dark:text-slate-400">No email delivery exists yet — if left blank, a temporary password is generated and shown once so you can relay it directly.</p>
              </div>
            </>
          }
        </div>
      </Modal>

      <Modal
        open={!!tempPasswordResult}
        onClose={() => setTempPasswordResult(null)}
        title="Temporary password"
        footer={<Button onClick={() => setTempPasswordResult(null)}>Done</Button>}>

        <p className="text-sm text-text-gray dark:text-slate-400">
          Share this with <strong>{tempPasswordResult?.name}</strong> directly — it will not be shown again.
        </p>
        <p className="mt-3 rounded-xl bg-soft-gray px-4 py-3 text-center font-mono text-lg font-bold text-navy dark:bg-slate-800/60 dark:text-slate-100">
          {tempPasswordResult?.password}
        </p>
      </Modal>

      <Modal
        open={permModalOpen}
        onClose={() => setPermModalOpen(false)}
        title={permTargetUser ? `${permTargetUser.name}'s permissions` : 'Permissions'}
        size="lg"
        footer={
        <>
            {permTargetUser?.hasCustomPermissions &&
          <Button variant="secondary" loading={savingPerms} onClick={resetPermissionsToRole}>Reset to role default</Button>
          }
            <Button variant="secondary" onClick={() => setPermModalOpen(false)}>Cancel</Button>
            <Button loading={savingPerms} onClick={savePermissions}>Save</Button>
          </>
        }>

        <p className="mb-3 text-sm text-text-gray dark:text-slate-400">
          Saving here gives <strong>{permTargetUser?.name}</strong> exactly this set of permissions, independent of their <strong>{permTargetUser?.roleName}</strong> role's defaults.
        </p>
        <div className="grid max-h-96 grid-cols-1 gap-4 overflow-y-auto rounded-xl border border-border-soft p-4 dark:border-slate-800 sm:grid-cols-2">
          {groupPermissions(permissionsCatalog).map((g) =>
          <div key={g.resource}>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">{titleCase(g.resource)}</p>
              <div className="space-y-1">
                {g.keys.map((k) => {
                const action = k.split(':')[1];
                return (
                  <label key={k} className="flex items-center gap-2 text-sm text-navy dark:text-slate-200">
                      <input
                      type="checkbox"
                      checked={permSelection.includes(k)}
                      onChange={() => togglePermission(k)}
                      className="h-4 w-4 rounded border-border-soft text-teal focus:ring-teal dark:border-slate-700" />

                      {titleCase(action)}
                    </label>);

              })}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>);

}
