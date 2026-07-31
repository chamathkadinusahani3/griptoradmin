import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MessageSquareIcon, PlusIcon, KeyIcon, CheckCircle2Icon, XCircleIcon, TrashIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Textarea, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Client } from '../../types/client';
import { MessageTemplate, SmsLog } from '../../types/messageTemplate';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';

const emptySmsForm = { userId: '', apiKey: '', senderId: '', alertsPhone: '' };
const emptyTemplateForm = { name: '', body: '' };

export function Messaging() {
  const [garage, setGarage] = useState<Client | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [smsForm, setSmsForm] = useState(emptySmsForm);
  const [savingSms, setSavingSms] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const loadGarage = () => {
    api
      .get<{ client: Client }>('/tenant/me')
      .then(({ client }) => {
        setGarage(client);
        setSmsForm((f) => ({ ...f, alertsPhone: client.alertsPhone ?? '' }));
      })
      .catch(() => setGarage(null));
  };
  const loadTemplates = () => {
    api.get<{ templates: MessageTemplate[] }>('/message-templates').then(({ templates }) => setTemplates(templates)).catch(() => setTemplates([]));
  };
  const loadLogs = () => {
    api.get<{ logs: SmsLog[] }>('/sms/logs').then(({ logs }) => setLogs(logs)).catch(() => setLogs([]));
  };

  useEffect(loadGarage, []);
  useEffect(loadTemplates, []);
  useEffect(loadLogs, []);

  const saveSmsConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSms(true);
    try {
      const { client } = await api.post<{ client: Client }>('/tenant/sms-config', smsForm);
      setGarage(client);
      setSmsForm({ ...emptySmsForm, alertsPhone: client.alertsPhone ?? '' });
      toast.success('SMS settings saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save SMS settings');
    } finally {
      setSavingSms(false);
    }
  };

  const addTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTemplate(true);
    try {
      await api.post('/message-templates', templateForm);
      toast.success('Template added');
      setTemplateOpen(false);
      setTemplateForm(emptyTemplateForm);
      loadTemplates();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add template');
    } finally {
      setSavingTemplate(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    const previous = templates;
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    try {
      await api.delete(`/message-templates/${id}`);
    } catch (err) {
      setTemplates(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete template');
    }
  };

  return (
    <div>
      <PageHeader title="Messaging" description="Real SMS via your own notify.lk account, message templates, and delivery history." />

      <Card className="mb-6">
        <CardHeader title="SMS settings" subtitle={garage?.hasSmsConfig ? `Connected — sender: ${garage.smsSenderId || 'default'}` : 'Not connected yet'} />
        <form onSubmit={saveSmsConfig} className="grid grid-cols-1 gap-4 p-5 pt-0 sm:grid-cols-3">
          <div>
            <Label htmlFor="sms-userid">notify.lk User ID</Label>
            <Input id="sms-userid" icon={KeyIcon} required value={smsForm.userId} onChange={(e) => setSmsForm((f) => ({ ...f, userId: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="sms-apikey">notify.lk API Key</Label>
            <Input id="sms-apikey" type="password" icon={KeyIcon} required value={smsForm.apiKey} onChange={(e) => setSmsForm((f) => ({ ...f, apiKey: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="sms-sender">Sender ID (optional)</Label>
            <Input id="sms-sender" value={smsForm.senderId} onChange={(e) => setSmsForm((f) => ({ ...f, senderId: e.target.value }))} placeholder="e.g. your garage name" />
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="sms-alerts-phone">Alerts phone number (optional)</Label>
            <Input id="sms-alerts-phone" value={smsForm.alertsPhone} onChange={(e) => setSmsForm((f) => ({ ...f, alertsPhone: e.target.value }))} placeholder="e.g. 0771234567" />
            <p className="mt-1 text-xs text-text-gray dark:text-slate-400">Where low-stock and weekly dealer-outstanding alerts are sent</p>
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" loading={savingSms}>{garage?.hasSmsConfig ? 'Update credentials' : 'Connect notify.lk'}</Button>
          </div>
        </form>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Message templates" subtitle="Reusable text with {name}, {vehicle}, {date} placeholders" action={<Button size="sm" variant="secondary" onClick={() => setTemplateOpen(true)}><PlusIcon className="h-4 w-4" /> Add</Button>} />
        {templates.length === 0 ?
        <div className="p-5 pt-0"><EmptyState icon={MessageSquareIcon} title="No templates yet" description="Add a reusable message template." /></div> :

        <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {templates.map((t) =>
          <li key={t.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="font-bold text-navy dark:text-slate-100">{t.name}</p>
                  <p className="truncate text-xs text-text-gray dark:text-slate-400">{t.body}</p>
                </div>
                <button onClick={() => deleteTemplate(t.id)} className="text-red-500 hover:text-red-600"><TrashIcon className="h-4 w-4" /></button>
              </li>
          )}
          </ul>
        }
      </Card>

      <Card>
        <CardHeader title="Recent sends" subtitle="Last 50 SMS attempts" />
        {logs.length === 0 ?
        <div className="p-5 pt-0"><EmptyState icon={MessageSquareIcon} title="No messages sent yet" description="Sends from Reminders or the API will show up here." /></div> :

        <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {logs.map((l) =>
          <li key={l.id} className="flex items-center gap-3 p-4">
                {l.sent ? <CheckCircle2Icon className="h-5 w-5 shrink-0 text-emerald-500" /> : <XCircleIcon className="h-5 w-5 shrink-0 text-red-500" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy dark:text-slate-100">{l.customer ?? l.to}</p>
                  <p className="truncate text-xs text-text-gray dark:text-slate-400">{l.sent ? l.message : l.error}</p>
                </div>
                <span className="shrink-0 text-xs text-text-gray dark:text-slate-400">{formatDate(l.createdAt)}</span>
              </li>
          )}
          </ul>
        }
      </Card>

      <Modal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        title="Add template"
        footer={
        <>
            <Button variant="secondary" onClick={() => setTemplateOpen(false)}>Cancel</Button>
            <Button form="add-template-form" type="submit" loading={savingTemplate}>Add template</Button>
          </>
        }>
        <form id="add-template-form" onSubmit={addTemplate} className="space-y-4">
          <div>
            <Label htmlFor="tpl-name">Template name</Label>
            <Input id="tpl-name" required value={templateForm.name} onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Service Reminder" />
          </div>
          <div>
            <Label htmlFor="tpl-body">Message</Label>
            <Textarea id="tpl-body" required value={templateForm.body} onChange={(e) => setTemplateForm((f) => ({ ...f, body: e.target.value }))} placeholder="Hi {name}, your vehicle is due for service." />
          </div>
        </form>
      </Modal>
    </div>);

}
