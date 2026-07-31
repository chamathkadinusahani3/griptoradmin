import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PlusIcon, MailIcon, Trash2Icon, PencilIcon } from 'lucide-react';
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

const ROLE_TONE: Record<string, 'purple' | 'teal' | 'blue' | 'gray'> = {
  Owner: 'purple',
  Admin: 'teal',
  Support: 'blue',
  Billing: 'gray',
};

const INVITABLE_ROLES = ['Admin', 'Support', 'Billing'] as const;

const emptyForm = { name: '', email: '', password: '', teamRole: 'Admin' as (typeof INVITABLE_ROLES)[number] };

export function Users() {
  const { user } = useAuth();
  const [team, setTeam] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [inviting, setInviting] = useState(false);

  const [editTarget, setEditTarget] = useState<AuthUser | null>(null);
  const [editRole, setEditRole] = useState<(typeof INVITABLE_ROLES)[number]>('Admin');
  const [savingRole, setSavingRole] = useState(false);

  const loadTeam = () => {
    setLoading(true);
    api
      .get<{ team: AuthUser[] }>('/team')
      .then(({ team }) => setTeam(team))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load users'))
      .finally(() => setLoading(false));
  };

  useEffect(loadTeam, []);

  const invite = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) return;
    setInviting(true);
    try {
      await api.post('/team', form);
      toast.success(`${form.name} added`);
      setForm(emptyForm);
      setInviteOpen(false);
      loadTeam();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add user');
    } finally {
      setInviting(false);
    }
  };

  const openEditRole = (member: AuthUser) => {
    setEditTarget(member);
    setEditRole((member.teamRole as (typeof INVITABLE_ROLES)[number]) ?? 'Admin');
  };

  const saveRole = async () => {
    if (!editTarget) return;
    setSavingRole(true);
    try {
      const { member } = await api.patch<{ member: AuthUser }>(`/team/${editTarget.id}`, { teamRole: editRole });
      setTeam((prev) => prev.map((m) => (m.id === member.id ? member : m)));
      toast.success(`${member.name}'s role updated`);
      setEditTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update role');
    } finally {
      setSavingRole(false);
    }
  };

  const remove = async (id: string, name: string) => {
    const previous = team;
    setTeam((prev) => prev.filter((m) => m.id !== id));
    try {
      await api.delete(`/team/${id}`);
      toast.success(`${name} removed`);
    } catch (err) {
      setTeam(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove user');
    }
  };

  return (
    <div>
      <PageHeader
        title="Users"
        description="People with access to the GRIPTOR admin — Owner, Admin, Support, and Billing."
        action={<Button onClick={() => setInviteOpen(true)}><PlusIcon className="h-4 w-4" /> Add user</Button>} />


      <Card>
        <CardHeader title="Team" subtitle="Every super admin user" />
        {loading ?
        <div className="p-5"><TableSkeleton rows={4} /></div> :
        team.length === 0 ?
        <EmptyState icon={MailIcon} title="No users yet" description="Add your first team member." /> :

        <ul className="p-5 pt-0">
            {team.map((m) =>
          <li key={m.id} className="flex items-center gap-3 border-t border-border-soft py-3 first:border-0 dark:border-slate-800">
                <Avatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-navy dark:text-slate-100">{m.name}</p>
                  <p className="truncate text-xs text-text-gray dark:text-slate-400">{m.email}</p>
                </div>
                {m.teamRole && <Badge tone={ROLE_TONE[m.teamRole]}>{m.teamRole}</Badge>}
                {m.status && <StatusBadge status={m.status} />}
                {m.teamRole !== 'Owner' &&
            <button
              onClick={() => openEditRole(m)}
              aria-label={`Edit ${m.name}'s role`}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">

                    <PencilIcon className="h-4 w-4" />
                  </button>
            }
                {m.teamRole !== 'Owner' && m.id !== user?.id &&
            <button
              onClick={() => remove(m.id, m.name)}
              aria-label={`Remove ${m.name}`}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10">

                  <Trash2Icon className="h-4 w-4" />
                </button>
            }
              </li>
          )}
          </ul>
        }
      </Card>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Add user"
        footer={
        <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={invite} disabled={!form.name.trim() || !form.email.trim() || !form.password.trim()} loading={inviting}><MailIcon className="h-4 w-4" /> Add</Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="user-name">Full name</Label>
            <Input id="user-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="user-email">Email address</Label>
            <Input id="user-email" type="email" icon={MailIcon} placeholder="name@griptor.io" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="user-password">Initial password</Label>
            <Input id="user-password" type="password" minLength={8} placeholder="At least 8 characters" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="user-role">Role</Label>
            <Select id="user-role" value={form.teamRole} onChange={(e) => setForm((f) => ({ ...f, teamRole: e.target.value as (typeof INVITABLE_ROLES)[number] }))}>
              {INVITABLE_ROLES.map((r) => <option key={r}>{r}</option>)}
            </Select>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`Edit ${editTarget?.name ?? ''}'s role`}
        footer={
        <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={saveRole} loading={savingRole}>Save</Button>
          </>
        }>

        <div>
          <Label htmlFor="edit-user-role">Role</Label>
          <Select id="edit-user-role" value={editRole} onChange={(e) => setEditRole(e.target.value as (typeof INVITABLE_ROLES)[number])}>
            {INVITABLE_ROLES.map((r) => <option key={r}>{r}</option>)}
          </Select>
        </div>
      </Modal>
    </div>);

}
