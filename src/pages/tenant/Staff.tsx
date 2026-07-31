import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PlusIcon, MailIcon, Trash2Icon, LockIcon, PencilIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label } from '../../components/ui/Input';
import { StatusBadge } from '../../components/StatusBadge';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { api, ApiError } from '../../lib/api';
import { AuthUser, useHasPermission } from '../../context/AuthContext';
import { Branch } from '../../types/branch';
import { Role } from '../../types/role';

const ROLE_TONE: Record<string, 'purple' | 'teal' | 'blue' | 'gray' | 'amber'> = {
  Owner: 'purple',
  Manager: 'teal',
  Technician: 'blue',
  Cashier: 'gray',
  'Sales Executive': 'amber',
};

const emptyForm = { name: '', email: '', password: '', roleId: '', branchId: '', creditLimit: '' };

export function Staff() {
  const canInvite = useHasPermission('staff:invite');
  const canEdit = useHasPermission('staff:edit');
  const canRemove = useHasPermission('staff:remove');
  const [staff, setStaff] = useState<AuthUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [inviting, setInviting] = useState(false);

  const assignableRoles = roles.filter((r) => !r.isProtectedOwner);
  const selectedRole = assignableRoles.find((r) => r.id === form.roleId);

  const loadStaff = () => {
    setLoading(true);
    api
      .get<{ staff: AuthUser[] }>('/staff')
      .then(({ staff }) => setStaff(staff))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load staff'))
      .finally(() => setLoading(false));
  };

  useEffect(loadStaff, []);
  useEffect(() => {
    api.get<{ branches: Branch[] }>('/branches').then(({ branches }) => setBranches(branches)).catch(() => setBranches([]));
    api
      .get<{ roles: Role[] }>('/roles')
      .then(({ roles }) => {
        setRoles(roles);
        const firstAssignable = roles.find((r) => !r.isProtectedOwner);
        if (firstAssignable) setForm((f) => ({ ...f, roleId: firstAssignable.id }));
      })
      .catch(() => setRoles([]));
  }, []);

  const invite = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim() || !form.roleId) return;
    if (selectedRole?.requiresCreditLimit && !(Number(form.creditLimit) > 0)) {
      toast.error(`A positive credit limit is required for the "${selectedRole.name}" role`);
      return;
    }
    setInviting(true);
    try {
      await api.post('/staff', {
        ...form,
        branchId: form.branchId || undefined,
        creditLimit: selectedRole?.requiresCreditLimit ? Number(form.creditLimit) : undefined,
      });
      toast.success(`${form.name} added`);
      setForm((f) => ({ ...emptyForm, roleId: f.roleId }));
      setInviteOpen(false);
      loadStaff();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add staff member');
    } finally {
      setInviting(false);
    }
  };

  const [limitTarget, setLimitTarget] = useState<AuthUser | null>(null);
  const [limitValue, setLimitValue] = useState('');
  const [savingLimit, setSavingLimit] = useState(false);

  const openEditLimit = (member: AuthUser) => {
    setLimitTarget(member);
    setLimitValue(String(member.creditLimit ?? ''));
  };

  const saveLimit = async () => {
    if (!limitTarget || !(Number(limitValue) > 0)) {
      toast.error('A positive credit limit is required');
      return;
    }
    setSavingLimit(true);
    try {
      const { member } = await api.patch<{ member: AuthUser }>(`/staff/${limitTarget.id}`, { creditLimit: Number(limitValue) });
      setStaff((prev) => prev.map((m) => (m.id === member.id ? member : m)));
      toast.success('Credit limit updated');
      setLimitTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update credit limit');
    } finally {
      setSavingLimit(false);
    }
  };

  const remove = async (id: string, name: string) => {
    const previous = staff;
    setStaff((prev) => prev.filter((m) => m.id !== id));
    try {
      await api.delete(`/staff/${id}`);
      toast.success(`${name} removed`);
    } catch (err) {
      setStaff(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove staff member');
    }
  };

  const canManageAnything = canInvite || canEdit || canRemove;

  return (
    <div>
      <PageHeader
        title="Staff"
        description="Give your team their own logins, roles, and branch access."
        action={canInvite ? <Button onClick={() => setInviteOpen(true)}><PlusIcon className="h-4 w-4" /> Add staff</Button> : undefined} />


      {!canManageAnything &&
      <Card className="mb-6">
          <div className="flex items-center gap-3 p-5">
            <LockIcon className="h-5 w-5 text-text-gray dark:text-slate-400" />
            <p className="text-sm text-text-gray dark:text-slate-400">You don't have permission to manage staff.</p>
          </div>
        </Card>
      }

      <Card>
        <CardHeader title="Team" subtitle="Everyone with access to this garage" />
        {loading ?
        <div className="p-5"><TableSkeleton rows={4} /></div> :
        staff.length === 0 ?
        <EmptyState icon={MailIcon} title="No staff yet" description="Add your first team member." /> :

        <ul className="p-5 pt-0">
            {staff.map((m) => {
            const branchName = branches.find((b) => b.id === m.branchId)?.name;
            const roleName = m.roleName ?? m.tenantRole;
            const isSalesLike = roles.find((r) => r.id === m.roleId)?.requiresCreditLimit ?? false;
            return (
              <li key={m.id} className="flex items-center gap-3 border-t border-border-soft py-3 first:border-0 dark:border-slate-800">
                  <Avatar name={m.name} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-navy dark:text-slate-100">{m.name}</p>
                    <p className="truncate text-xs text-text-gray dark:text-slate-400">{m.email}{branchName ? ` · ${branchName}` : ''}</p>
                  </div>
                  {roleName && <Badge tone={ROLE_TONE[roleName] ?? 'gray'}>{roleName}</Badge>}
                  {isSalesLike &&
                <span className="text-xs text-text-gray dark:text-slate-400">Limit: {m.creditLimit ?? 0}</span>
                }
                  {m.status && <StatusBadge status={m.status} />}
                  {canEdit && isSalesLike &&
                <button
                  onClick={() => openEditLimit(m)}
                  aria-label={`Edit ${m.name}'s credit limit`}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">

                      <PencilIcon className="h-4 w-4" />
                    </button>
                }
                  {canRemove && !m.isOwner &&
                <button
                  onClick={() => remove(m.id, m.name)}
                  aria-label={`Remove ${m.name}`}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10">

                      <Trash2Icon className="h-4 w-4" />
                    </button>
                }
                </li>);

          })}
          </ul>
        }
      </Card>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Add staff member"
        footer={
        <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={invite} disabled={!form.name.trim() || !form.email.trim() || !form.password.trim() || !form.roleId} loading={inviting}><MailIcon className="h-4 w-4" /> Add</Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="staff-name">Full name</Label>
            <Input id="staff-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="staff-email">Email address</Label>
            <Input id="staff-email" type="email" icon={MailIcon} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="staff-password">Initial password</Label>
            <Input id="staff-password" type="password" minLength={8} placeholder="At least 8 characters" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="staff-role">Role</Label>
            <Select id="staff-role" value={form.roleId} onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}>
              {assignableRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </div>
          {selectedRole?.requiresCreditLimit &&
          <div>
              <Label htmlFor="staff-credit-limit">Credit limit</Label>
              <Input id="staff-credit-limit" type="number" min={1} required value={form.creditLimit} onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))} placeholder="Max outstanding balance they can approve" />
            </div>
          }
          {branches.length > 0 &&
          <div>
              <Label htmlFor="staff-branch">Branch (optional)</Label>
              <Select id="staff-branch" value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
                <option value="">— all branches —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
          }
        </div>
      </Modal>

      <Modal
        open={!!limitTarget}
        onClose={() => setLimitTarget(null)}
        title={`Edit ${limitTarget?.name ?? ''}'s credit limit`}
        footer={
        <>
            <Button variant="secondary" onClick={() => setLimitTarget(null)}>Cancel</Button>
            <Button onClick={saveLimit} loading={savingLimit}>Save</Button>
          </>
        }>

        <div>
          <Label htmlFor="edit-credit-limit">Credit limit</Label>
          <Input id="edit-credit-limit" type="number" min={1} value={limitValue} onChange={(e) => setLimitValue(e.target.value)} />
        </div>
      </Modal>
    </div>);

}
