import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PlusIcon, MailIcon, Trash2Icon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Toggle } from '../../components/ui/Toggle';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label } from '../../components/ui/Input';
import { StatusBadge } from '../../components/StatusBadge';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { api, ApiError } from '../../lib/api';
import { AuthUser, NotificationPrefs, useAuth } from '../../context/AuthContext';

const ROLE_TONE: Record<string, 'purple' | 'teal' | 'blue' | 'gray'> = {
  Owner: 'purple',
  Admin: 'teal',
  Support: 'blue',
  Billing: 'gray'
};

const DEFAULT_PREFS: NotificationPrefs = {
  newLeads: true,
  failedPayments: true,
  newTickets: true,
  weeklyDigest: false,
  productUpdates: true
};

export function SuperSettings() {
  const { user } = useAuth();
  const [team, setTeam] = useState<AuthUser[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState('Support');
  const [inviting, setInviting] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(user?.notificationPrefs ?? DEFAULT_PREFS);

  const loadTeam = () => {
    setLoadingTeam(true);
    api
      .get<{ team: AuthUser[] }>('/team')
      .then(({ team }) => setTeam(team))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load team'))
      .finally(() => setLoadingTeam(false));
  };

  useEffect(loadTeam, []);

  const invite = async () => {
    if (!inviteEmail.trim() || !invitePassword.trim()) return;
    setInviting(true);
    try {
      await api.post('/team', { email: inviteEmail.trim(), teamRole: inviteRole, password: invitePassword });
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      setInvitePassword('');
      setInviteOpen(false);
      loadTeam();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to invite team member');
    } finally {
      setInviting(false);
    }
  };

  const remove = async (id: string, name: string) => {
    const previous = team;
    setTeam((prev) => prev.filter((m) => m.id !== id));
    try {
      await api.delete(`/team/${id}`);
      toast.success(`${name} removed from the team`);
    } catch (err) {
      setTeam(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove team member');
    }
  };

  const togglePref = async (key: keyof NotificationPrefs, label: string) => {
    const next = { ...prefs, [key]: !prefs[key] };
    const previous = prefs;
    setPrefs(next);
    try {
      await api.patch('/settings/notifications', { [key]: next[key] });
      toast.success(`${label} ${next[key] ? 'enabled' : 'disabled'}`);
    } catch (err) {
      setPrefs(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update preference');
    }
  };

  return (
    <div>
      <PageHeader title="Settings" description="Manage your team and notification preferences." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Team members & roles"
            subtitle="People with access to the GRIPTOR admin"
            action={<Button size="sm" onClick={() => setInviteOpen(true)}><PlusIcon className="h-4 w-4" /> Invite</Button>} />

          {loadingTeam ?
          <div className="p-5"><TableSkeleton rows={4} /></div> :

          <ul className="p-5 pt-4">
            {team.map((m) =>
            <li key={m.id} className="flex items-center gap-3 border-b border-border-soft py-3 last:border-0 dark:border-slate-800">
                <Avatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-navy dark:text-slate-100">{m.name}</p>
                  <p className="truncate text-xs text-text-gray dark:text-slate-400">{m.email}</p>
                </div>
                {m.teamRole && <Badge tone={ROLE_TONE[m.teamRole]}>{m.teamRole}</Badge>}
                {m.status && <StatusBadge status={m.status} />}
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

        <Card>
          <CardHeader title="Notifications" subtitle="Email preferences" />
          <div className="space-y-1 p-5 pt-4">
            {(
            [
            { key: 'newLeads', label: 'New leads', desc: 'When a contact form is submitted' },
            { key: 'failedPayments', label: 'Failed payments', desc: 'Payment collection failures' },
            { key: 'newTickets', label: 'New tickets', desc: 'New support requests' },
            { key: 'weeklyDigest', label: 'Weekly digest', desc: 'Summary every Monday' },
            { key: 'productUpdates', label: 'Product updates', desc: 'GRIPTOR release notes' }] as
            const).
            map((p) =>
            <div key={p.key} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-navy dark:text-slate-200">{p.label}</p>
                  <p className="text-xs text-text-gray dark:text-slate-400">{p.desc}</p>
                </div>
                <Toggle
                checked={prefs[p.key]}
                onChange={() => togglePref(p.key, p.label)}
                label={p.label} />

              </div>
            )}
          </div>
        </Card>
      </div>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite team member"
        footer={
        <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={invite} disabled={!inviteEmail.trim() || !invitePassword.trim()} loading={inviting}><MailIcon className="h-4 w-4" /> Send invite</Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="invite-email">Email address</Label>
            <Input id="invite-email" type="email" icon={MailIcon} placeholder="name@griptor.io" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="invite-password">Initial password</Label>
            <Input id="invite-password" type="password" minLength={8} placeholder="At least 8 characters" value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="invite-role">Role</Label>
            <Select id="invite-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
              <option>Admin</option>
              <option>Support</option>
              <option>Billing</option>
            </Select>
          </div>
        </div>
      </Modal>
    </div>);

}
