import React, { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Toggle } from '../../components/ui/Toggle';
import { api, ApiError } from '../../lib/api';
import { NotificationPrefs, useAuth } from '../../context/AuthContext';

const DEFAULT_PREFS: NotificationPrefs = {
  newLeads: true,
  failedPayments: true,
  newTickets: true,
  weeklyDigest: false,
  productUpdates: true
};

export function SuperSettings() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>(user?.notificationPrefs ?? DEFAULT_PREFS);

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
      <PageHeader title="Settings" description="Notification preferences." />

      <div className="max-w-md">
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
    </div>);

}
