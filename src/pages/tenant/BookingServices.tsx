import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ListChecksIcon, PlusIcon, ClockIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Label } from '../../components/ui/Input';
import { Toggle } from '../../components/ui/Toggle';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Service } from '../../types/service';
import { api, ApiError } from '../../lib/api';

const emptyForm = { name: '', category: '', durationMinutes: '30' };

export function BookingServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadServices = () => {
    setLoading(true);
    api
      .get<{ services: Service[] }>('/services')
      .then(({ services }) => setServices(services))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load services'))
      .finally(() => setLoading(false));
  };

  useEffect(loadServices, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/services', { ...form, durationMinutes: Number(form.durationMinutes) || 30 });
      toast.success(`${form.name} added`);
      setAddOpen(false);
      setForm(emptyForm);
      loadServices();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add service');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (service: Service) => {
    const previous = services;
    setServices((prev) => prev.map((s) => (s.id === service.id ? { ...s, active: !s.active } : s)));
    try {
      await api.patch(`/services/${service.id}`, { active: !service.active });
    } catch (err) {
      setServices(previous);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update service');
    }
  };

  return (
    <div>
      <PageHeader
        title="Services"
        description="What customers can pick from on your public booking page."
        action={<Button onClick={() => setAddOpen(true)}><PlusIcon className="h-4 w-4" /> Add service</Button>} />


      {loading ?
      <Card><div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div></Card> :
      services.length === 0 ?
      <Card><EmptyState icon={ListChecksIcon} title="No services yet" description="Add services so customers have something to pick from when booking." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {services.map((s) =>
          <li key={s.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="font-bold text-navy dark:text-slate-100">{s.name}</p>
                  <p className="flex items-center gap-2 text-xs text-text-gray dark:text-slate-400">
                    {s.category && <span>{s.category}</span>}
                    <span className="flex items-center gap-1"><ClockIcon className="h-3 w-3" /> {s.durationMinutes} min</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-gray dark:text-slate-400">{s.active ? 'Visible' : 'Hidden'}</span>
                  <Toggle checked={s.active} onChange={() => toggleActive(s)} />
                </div>
              </li>
          )}
          </ul>
        </Card>
      }

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add service"
        footer={
        <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button form="add-service-form" type="submit" loading={saving}>Add service</Button>
          </>
        }>
        <form id="add-service-form" onSubmit={handleAdd} className="space-y-4">
          <div>
            <Label htmlFor="svc-name">Service name</Label>
            <Input id="svc-name" required placeholder="e.g. Wheel Alignment" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="svc-category">Category (optional)</Label>
            <Input id="svc-category" placeholder="e.g. Tyres" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="svc-duration">Estimated duration (minutes)</Label>
            <Input id="svc-duration" type="number" value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>);

}
