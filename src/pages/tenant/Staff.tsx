import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PlusIcon, MailIcon, Trash2Icon, LockIcon } from 'lucide-react';
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
import { AuthUser, useAuth } from '../../context/AuthContext';
import { Branch } from '../../types/branch';

const ROLE_TONE: Record<string, 'purple' | 'teal' | 'blue' | 'gray'> = {
  Owner: 'purple',
  Manager: 'teal',
  Technician: 'blue',
  Cashier: 'gray',
};

const emptyForm = { name: '', email: '', password: '', tenantRole: 'Technician', branchId: '' };

export function Staff() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<AuthUser[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [inviting, setInviting] = useState(false);

  const canManage = user?.tenantRole === 'Owner' || user?.tenantRole === 'Manager';

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
  }, []);

  const invite = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) return;
    setInviting(true);
    try {
      await api.post('/staff', { ...form, branchId: form.branchId || undefined });
      toast.success(`${form.name} added`);
      setForm(emptyForm);
      setInviteOpen(false);
      loadStaff();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add staff member');
    } finally {
      setInviting(false);
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

  return (
    <div>
      <PageHeader
        title="Staff"
        description="Give your team their own logins, roles, and branch access."
        action={canManage ? <Button onClick={() => setInviteOpen(true)}><PlusIcon className="h-4 w-4" /> Add staff</Button> : undefined} />


      {!canManage &&
      <Card className="mb-6">
          <div className="flex items-center gap-3 p-5">
            <LockIcon className="h-5 w-5 text-text-gray dark:text-slate-400" />
            <p className="text-sm text-text-gray dark:text-slate-400">Only an Owner or Manager can add or remove staff.</p>
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
            return (
              <li key={m.id} className="flex items-center gap-3 border-t border-border-soft py-3 first:border-0 dark:border-slate-800">
                  <Avatar name={m.name} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-navy dark:text-slate-100">{m.name}</p>
                    <p className="truncate text-xs text-text-gray dark:text-slate-400">{m.email}{branchName ? ` · ${branchName}` : ''}</p>
                  </div>
                  {m.tenantRole && <Badge tone={ROLE_TONE[m.tenantRole]}>{m.tenantRole}</Badge>}
                  {m.status && <StatusBadge status={m.status} />}
                  {canManage && m.tenantRole !== 'Owner' && m.id !== user?.id &&
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
            <Button onClick={invite} disabled={!form.name.trim() || !form.email.trim() || !form.password.trim()} loading={inviting}><MailIcon className="h-4 w-4" /> Add</Button>
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
            <Select id="staff-role" value={form.tenantRole} onChange={(e) => setForm((f) => ({ ...f, tenantRole: e.target.value }))}>
              <option>Manager</option>
              <option>Technician</option>
              <option>Cashier</option>
            </Select>
          </div>
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
    </div>);

}
