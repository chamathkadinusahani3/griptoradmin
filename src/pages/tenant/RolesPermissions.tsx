import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ShieldIcon, PlusIcon, PencilIcon, Trash2Icon, LockIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Label } from '../../components/ui/Input';
import { Toggle } from '../../components/ui/Toggle';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { Role } from '../../types/role';
import { api, ApiError } from '../../lib/api';
import { useHasPermission } from '../../context/AuthContext';

const emptyForm = { name: '', permissions: [] as string[], branchPinned: false, requiresCreditLimit: false };

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

export function RolesPermissions() {
  const canManage = useHasPermission('roles:manage');
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const grouped = useMemo(() => groupPermissions(allPermissions), [allPermissions]);

  const load = () => {
    setLoading(true);
    Promise.all([api.get<{ roles: Role[] }>('/roles'), api.get<{ permissions: string[] }>('/permissions')])
      .then(([{ roles }, { permissions }]) => {
        setRoles(roles);
        setAllPermissions(permissions);
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load roles'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (role: Role) => {
    setEditing(role);
    setForm({ name: role.name, permissions: role.permissions, branchPinned: role.branchPinned, requiresCreditLimit: role.requiresCreditLimit });
    setModalOpen(true);
  };

  const togglePermission = (key: string) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key) ? f.permissions.filter((p) => p !== key) : [...f.permissions, key],
    }));
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Role name is required');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { role } = await api.patch<{ role: Role }>(`/roles/${editing.id}`, form);
        setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, ...role } : r)));
        toast.success(`"${role.name}" updated`);
      } else {
        const { role } = await api.post<{ role: Role }>('/roles', form);
        setRoles((prev) => [...prev, { ...role, memberCount: 0 }]);
        toast.success(`"${role.name}" created`);
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save role');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (role: Role) => {
    try {
      await api.delete(`/roles/${role.id}`);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      toast.success(`"${role.name}" deleted`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete role');
    }
  };

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="Create custom roles and choose exactly what each one can do."
        action={canManage ? <Button onClick={openCreate}><PlusIcon className="h-4 w-4" /> New role</Button> : undefined} />


      {!canManage &&
      <Card className="mb-6">
          <div className="flex items-center gap-3 p-5">
            <LockIcon className="h-5 w-5 text-text-gray dark:text-slate-400" />
            <p className="text-sm text-text-gray dark:text-slate-400">You don't have permission to manage roles.</p>
          </div>
        </Card>
      }

      <Card>
        <CardHeader title="Roles" subtitle="Every role available to assign on the Staff page" />
        {loading ?
        <div className="p-5"><TableSkeleton rows={5} /></div> :
        roles.length === 0 ?
        <EmptyState icon={ShieldIcon} title="No roles yet" description="Create your first custom role." /> :

        <ul className="p-5 pt-0">
            {roles.map((r) =>
          <li key={r.id} className="flex items-center gap-3 border-t border-border-soft py-3 first:border-0 dark:border-slate-800">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-navy dark:text-slate-100">{r.name}</p>
                    {r.isProtectedOwner && <Badge tone="purple">Protected</Badge>}
                    {r.branchPinned && <Badge tone="blue">Branch-pinned</Badge>}
                    {r.requiresCreditLimit && <Badge tone="amber">Credit limit</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-text-gray dark:text-slate-400">
                    {r.isProtectedOwner ? 'Full access to everything, always' : `${r.permissions.length} permission${r.permissions.length === 1 ? '' : 's'}`}
                    {' · '}{r.memberCount} member{r.memberCount === 1 ? '' : 's'}
                  </p>
                </div>
                {canManage && !r.isProtectedOwner &&
            <>
                    <button
                onClick={() => openEdit(r)}
                aria-label={`Edit ${r.name}`}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">

                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                onClick={() => remove(r)}
                aria-label={`Delete ${r.name}`}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10">

                      <Trash2Icon className="h-4 w-4" />
                    </button>
                  </>
            }
              </li>
          )}
          </ul>
        }
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit "${editing.name}"` : 'New role'}
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={!form.name.trim()}>Save</Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="role-name">Role name</Label>
            <Input id="role-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Credit Controller" />
          </div>

          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Toggle checked={form.branchPinned} onChange={(v) => setForm((f) => ({ ...f, branchPinned: v }))} label="Branch-pinned" />
              <span className="text-sm text-navy dark:text-slate-200">Restrict staff with this role to their own branch</span>
            </div>
            <div className="flex items-center gap-2">
              <Toggle checked={form.requiresCreditLimit} onChange={(v) => setForm((f) => ({ ...f, requiresCreditLimit: v }))} label="Requires credit limit" />
              <span className="text-sm text-navy dark:text-slate-200">Enforce a personal credit-exposure cap on corporate sales</span>
            </div>
          </div>

          <div>
            <Label>Permissions</Label>
            <div className="mt-2 grid max-h-96 grid-cols-1 gap-4 overflow-y-auto rounded-xl border border-border-soft p-4 dark:border-slate-800 sm:grid-cols-2">
              {grouped.map((g) =>
              <div key={g.resource}>
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">{titleCase(g.resource)}</p>
                  <div className="space-y-1">
                    {g.keys.map((k) => {
                    const action = k.split(':')[1];
                    return (
                      <label key={k} className="flex items-center gap-2 text-sm text-navy dark:text-slate-200">
                          <input
                          type="checkbox"
                          checked={form.permissions.includes(k)}
                          onChange={() => togglePermission(k)}
                          className="h-4 w-4 rounded border-border-soft text-teal focus:ring-teal dark:border-slate-700" />

                          {titleCase(action)}
                        </label>);

                  })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>);

}
