import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MessageCircleIcon, MailIcon, SmartphoneIcon, PlusIcon, BellRingIcon, CarIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Reminder, ReminderChannel } from '../../types/reminder';
import { Customer } from '../../types/customer';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const CHANNEL_ICON: Record<ReminderChannel, typeof MailIcon> = {
  SMS: SmartphoneIcon,
  WhatsApp: MessageCircleIcon,
  Email: MailIcon
};

const emptyForm = { customerId: '', vehicle: '', type: '', channel: 'SMS' as ReminderChannel, scheduledFor: '' };

export function Reminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadReminders = () => {
    api
      .get<{ reminders: Reminder[] }>('/reminders')
      .then(({ reminders }) => setReminders(reminders))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load reminders'));
  };

  useEffect(loadReminders, []);

  useEffect(() => {
    api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([]));
  }, []);

  const scheduled = reminders.filter((r) => r.status === 'Scheduled').length;
  const sent = reminders.filter((r) => r.status === 'Sent').length;
  const failed = reminders.filter((r) => r.status === 'Failed').length;

  const [sendingId, setSendingId] = useState<string | null>(null);

  // Real send via notify.lk (api/sms/send.ts) — the first thing that ever
  // actually sets Reminder.status away from 'Scheduled'. Only SMS is a real
  // gateway right now (WhatsApp/Email have no integration to call).
  const sendNow = async (r: Reminder) => {
    setSendingId(r.id);
    try {
      const { error } = await api.post<{ error?: string }>('/sms/send', {
        customerId: r.customerId,
        message: `Hi, this is a reminder: ${r.type}${r.vehicle ? ` for your ${r.vehicle}` : ''}.`,
        reminderId: r.id,
      });
      setReminders((prev) => prev.map((x) => x.id === r.id ? { ...x, status: error ? 'Failed' : 'Sent' } : x));
      if (error) toast.error(error);
      else toast.success(`Sent to ${r.customer}`);
    } catch (err) {
      setReminders((prev) => prev.map((x) => x.id === r.id ? { ...x, status: 'Failed' } : x));
      toast.error(err instanceof ApiError ? err.message : 'Failed to send reminder');
    } finally {
      setSendingId(null);
    }
  };

  const openCreate = () => {
    setForm({ ...emptyForm, customerId: customers[0]?.id ?? '' });
    setAddOpen(true);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/reminders', form);
      toast.success('Reminder scheduled');
      setAddOpen(false);
      loadReminders();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to schedule reminder');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Reminders"
        description="Automated service reminders across SMS, WhatsApp and email."
        action={<Button onClick={openCreate} disabled={customers.length === 0} title={customers.length === 0 ? 'Add a customer first' : undefined}><PlusIcon className="h-4 w-4" /> Schedule reminder</Button>} />


      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Scheduled" value={String(scheduled)} icon={BellRingIcon} hint="upcoming" />
        <StatCard label="Sent" value={String(sent)} icon={MessageCircleIcon} hint="delivered" />
        <StatCard label="Failed" value={String(failed)} icon={SmartphoneIcon} hint="needs retry" />
      </div>

      <Card>
        {reminders.length === 0 ?
        <EmptyState icon={BellRingIcon} title="No reminders yet" description="Schedule your first automated reminder." /> :

        <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {reminders.map((r) => {
            const Icon = CHANNEL_ICON[r.channel];
            return (
              <li key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-light-blue text-teal dark:bg-teal/15">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-navy dark:text-slate-100">{r.type}</p>
                    <p className="flex items-center gap-1.5 text-xs text-text-gray dark:text-slate-400">
                      {r.customer} · <CarIcon className="h-3 w-3" /> {r.vehicle}
                    </p>
                  </div>
                  <Badge tone="gray">{r.channel}</Badge>
                  <span className="text-sm text-text-gray dark:text-slate-400">{formatDate(r.scheduledFor)}</span>
                  <StatusBadge status={r.status} />
                  {r.channel === 'SMS' && r.status !== 'Sent' &&
                <Button size="sm" variant="secondary" loading={sendingId === r.id} onClick={() => sendNow(r)}>
                      {r.status === 'Failed' ? 'Retry' : 'Send now'}
                    </Button>
                }
                </li>);

          })}
          </ul>
        }
      </Card>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Schedule reminder"
        footer={
        <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button form="add-reminder-form" type="submit" loading={saving}>Schedule reminder</Button>
          </>
        }>
        <form id="add-reminder-form" onSubmit={handleAdd} className="space-y-4">
          <div>
            <Label htmlFor="r-customer">Customer</Label>
            <Select id="r-customer" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="r-vehicle">Vehicle</Label>
            <Input id="r-vehicle" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} placeholder="2021 Toyota Camry" />
          </div>
          <div>
            <Label htmlFor="r-type">Reminder</Label>
            <Input id="r-type" required value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="e.g. Oil change due" />
          </div>
          <div>
            <Label htmlFor="r-channel">Channel</Label>
            <Select id="r-channel" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as ReminderChannel })}>
              <option value="SMS">SMS</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Email">Email</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="r-date">Scheduled for</Label>
            <Input id="r-date" type="date" required value={form.scheduledFor} onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })} />
          </div>
        </form>
      </Modal>
    </div>);

}
