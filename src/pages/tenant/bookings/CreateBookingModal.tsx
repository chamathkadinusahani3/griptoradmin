import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input, Textarea, Label } from '../../../components/ui/Input';
import { Booking } from '../../../types/booking';
import { Branch } from '../../../types/branch';
import { Service } from '../../../types/service';
import { Customer } from '../../../types/customer';
import { api, ApiError } from '../../../lib/api';
import { normalizePlate, isValidSriLankanPlate } from '../../../lib/plate';

interface AvailabilitySlot {
  time: string;
  booked: number;
  capacity: number;
  available: boolean;
}

export interface RebookPrefill {
  customerId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  vehicle: string;
  plate?: string;
  serviceIds: string[];
  branchId?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (booking: Booking) => void;
  branches: Branch[];
  services: Service[];
  /** Non-Owner/Manager staff pinned to one branch — branch step is skipped and forced to this. */
  lockedBranchId?: string;
  /** Set when opened via "Re-book" — customer/vehicle/services pre-filled, wizard jumps to the date step. */
  prefill?: RebookPrefill | null;
}

type Step = 'branch' | 'category' | 'services' | 'date' | 'slot' | 'customer';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm() {
  return {
    branchId: '',
    category: '',
    serviceIds: [] as string[],
    date: todayStr(),
    timeSlot: '',
    phone: '',
    name: '',
    email: '',
    vehicle: '',
    plate: '',
    notes: '',
  };
}

export function CreateBookingModal({ open, onClose, onCreated, branches, services, lockedBranchId, prefill }: Props) {
  const [form, setForm] = useState(emptyForm());
  const [resolvedCustomerId, setResolvedCustomerId] = useState('');
  const [step, setStep] = useState<Step>('branch');
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const effectiveBranchId = lockedBranchId || form.branchId;
  const selectedBranch = branches.find((b) => b.id === effectiveBranchId);

  const availableCategories = useMemo(() => {
    const all = [...new Set(services.map((s) => s.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
    if (selectedBranch?.serviceCategories && selectedBranch.serviceCategories.length > 0) {
      return all.filter((c) => selectedBranch.serviceCategories!.includes(c));
    }
    return all;
  }, [services, selectedBranch]);

  const eligibleServices = useMemo(() => {
    let list = services.filter((s) => s.active);
    if (selectedBranch?.serviceCategories && selectedBranch.serviceCategories.length > 0) {
      list = list.filter((s) => !s.category || selectedBranch.serviceCategories!.includes(s.category));
    }
    if (form.category) list = list.filter((s) => s.category === form.category);
    return list;
  }, [services, selectedBranch, form.category]);

  // Steps are skipped when there's nothing to actually choose — a
  // single-branch garage never sees a branch step, a garage with no
  // service categories never sees a category filter step.
  const steps = useMemo(() => {
    const s: Step[] = [];
    if (!lockedBranchId && branches.length > 1) s.push('branch');
    if (availableCategories.length > 1) s.push('category');
    s.push('services', 'date', 'slot', 'customer');
    return s;
  }, [lockedBranchId, branches.length, availableCategories.length]);

  useEffect(() => {
    if (!open) return;
    if (prefill) {
      setForm({
        ...emptyForm(),
        branchId: prefill.branchId ?? '',
        serviceIds: prefill.serviceIds,
        vehicle: prefill.vehicle,
        plate: prefill.plate ?? '',
        phone: prefill.customerPhone ?? '',
        name: prefill.customerName,
        email: prefill.customerEmail ?? '',
      });
      setResolvedCustomerId(prefill.customerId);
      setStep('date');
    } else {
      setForm(emptyForm());
      setResolvedCustomerId('');
      setStep(steps[0] ?? 'services');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill]);

  useEffect(() => {
    if (step !== 'slot' || !effectiveBranchId && branches.length > 1) return;
    if (!form.date) return;
    setSlotsLoading(true);
    setForm((f) => ({ ...f, timeSlot: '' }));
    const query = effectiveBranchId ? `?date=${form.date}&branchId=${effectiveBranchId}` : `?date=${form.date}`;
    api
      .get<{ slots: AvailabilitySlot[] }>(`/bookings/availability${query}`)
      .then(({ slots }) => setSlots(slots))
      .catch(() => toast.error('Could not load slot availability'))
      .finally(() => setSlotsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, form.date, effectiveBranchId]);

  // Debounced phone/plate lookup — auto-fills name/email for a returning customer.
  useEffect(() => {
    if (step !== 'customer') return;
    const phone = form.phone.trim();
    const plate = form.plate.trim();
    if (!phone && !plate) {
      setResolvedCustomerId('');
      return;
    }
    const handle = setTimeout(() => {
      setLookupLoading(true);
      const query = phone ? `?phone=${encodeURIComponent(phone)}` : `?plate=${encodeURIComponent(plate)}`;
      api
        .get<{ customers: Customer[] }>(`/customers${query}`)
        .then(({ customers }) => {
          const match = customers[0];
          if (match) {
            setResolvedCustomerId(match.id);
            setForm((f) => ({ ...f, name: match.name, email: match.email, phone: match.phone || f.phone }));
          } else {
            setResolvedCustomerId('');
          }
        })
        .catch(() => undefined)
        .finally(() => setLookupLoading(false));
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.phone, form.plate, step]);

  const stepIndex = steps.indexOf(step);
  const goNext = () => setStep(steps[stepIndex + 1]);
  const goBack = () => setStep(steps[stepIndex - 1]);

  const toggleService = (id: string) => {
    setForm((f) => ({ ...f, serviceIds: f.serviceIds.includes(id) ? f.serviceIds.filter((s) => s !== id) : [...f.serviceIds, id] }));
  };

  const plateError = form.plate.trim() && !isValidSriLankanPlate(form.plate) ? 'That doesn’t look like a valid plate number' : null;

  const canGoNext =
    step === 'branch' ? !!form.branchId :
    step === 'category' ? true :
    step === 'services' ? form.serviceIds.length > 0 :
    step === 'date' ? !!form.date :
    step === 'slot' ? !!form.timeSlot :
    true;

  const canSubmit =
    !!form.vehicle.trim() &&
    !plateError &&
    (!!resolvedCustomerId || (!!form.name.trim() && !!form.email.trim()));

  const submit = async () => {
    if (!canSubmit) {
      toast.error('Vehicle, and either a matched customer or a name + email, are required');
      return;
    }
    setSaving(true);
    try {
      let customerId = resolvedCustomerId;
      if (!customerId) {
        const { customer } = await api.post<{ customer: Customer }>('/customers', {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
        });
        customerId = customer.id;
      }

      const { booking } = await api.post<{ booking: Booking }>('/bookings', {
        customerId,
        serviceIds: form.serviceIds,
        vehicle: form.vehicle.trim(),
        plate: form.plate.trim() ? normalizePlate(form.plate) : undefined,
        date: form.date,
        timeSlot: form.timeSlot,
        notes: form.notes.trim() || undefined,
        branchId: effectiveBranchId || undefined,
      });
      toast.success('Booking created');
      onCreated(booking);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create booking');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={prefill ? 'Re-book appointment' : 'New booking'} size="lg"
      footer={
      <>
          {stepIndex > 0 && <Button variant="secondary" onClick={goBack}>Back</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {step === 'customer' ?
          <Button onClick={submit} loading={saving} disabled={!canSubmit}>Create booking</Button> :

          <Button onClick={goNext} disabled={!canGoNext}>Next</Button>
          }
        </>
      }>

      <div className="mb-5 flex items-center justify-center gap-1.5">
        {steps.map((s, i) => <span key={s} className={`h-1.5 w-8 rounded-full ${i <= stepIndex ? 'bg-griptor-gradient' : 'bg-slate-200 dark:bg-slate-700'}`} />)}
      </div>

      {step === 'branch' &&
      <div>
          <Label>Which branch?</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {branches.map((b) =>
          <button key={b.id} type="button" onClick={() => setForm((f) => ({ ...f, branchId: b.id, category: '', serviceIds: [] }))}
            className={`rounded-xl border-2 p-3 text-left transition ${form.branchId === b.id ? 'border-teal ring-2 ring-teal/30' : 'border-border-soft hover:border-teal/50 dark:border-slate-700'}`}>
                <p className="font-bold text-navy dark:text-slate-100">{b.name}</p>
                {b.address && <p className="text-xs text-text-gray dark:text-slate-400">{b.address}</p>}
              </button>
          )}
          </div>
        </div>
      }

      {step === 'category' &&
      <div>
          <Label>What kind of service?</Label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setForm((f) => ({ ...f, category: '' }))}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${!form.category ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>
              All
            </button>
            {availableCategories.map((c) =>
          <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, category: c }))}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${form.category === c ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>
                {c}
              </button>
          )}
          </div>
        </div>
      }

      {step === 'services' &&
      <div>
          <Label>Services</Label>
          {eligibleServices.length === 0 ?
          <p className="text-sm text-text-gray dark:text-slate-400">No services available for this branch/category.</p> :

          <div className="flex flex-wrap gap-2">
              {eligibleServices.map((s) =>
            <button key={s.id} type="button" onClick={() => toggleService(s.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${form.serviceIds.includes(s.id) ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>
                  {s.name} <span className="opacity-70">· {s.durationMinutes}m</span>
                </button>
            )}
            </div>
          }
        </div>
      }

      {step === 'date' &&
      <div>
          <Label htmlFor="cbm-date">Date</Label>
          <Input id="cbm-date" type="date" min={todayStr()} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        </div>
      }

      {step === 'slot' &&
      <div>
          <Label>Time slot</Label>
          {slotsLoading ?
          <p className="text-sm text-text-gray dark:text-slate-400">Loading availability…</p> :

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((s) =>
            <button key={s.time} type="button" disabled={!s.available} onClick={() => setForm((f) => ({ ...f, timeSlot: s.time }))}
              className={`rounded-xl border-2 p-2 text-center text-sm font-semibold transition ${
              !s.available ? 'cursor-not-allowed border-border-soft bg-soft-gray text-slate-400 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-600' :
              form.timeSlot === s.time ? 'border-teal bg-teal/10 text-teal ring-2 ring-teal/30' :
              'border-border-soft text-navy hover:border-teal/50 dark:border-slate-700 dark:text-slate-200'}`
              }>
                  {s.time}
                  <span className="block text-[10px] font-normal opacity-70">{s.booked}/{s.capacity} booked</span>
                </button>
            )}
            </div>
          }
        </div>
      }

      {step === 'customer' &&
      <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cbm-phone">Phone</Label>
              <Input id="cbm-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="For lookup + SMS alerts" />
            </div>
            <div>
              <Label htmlFor="cbm-plate">License plate</Label>
              <Input id="cbm-plate" value={form.plate} onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value }))} placeholder="WP CAB-1234" />
              {plateError && <p className="mt-1 text-xs text-red-600">{plateError}</p>}
            </div>
          </div>
          {lookupLoading && <p className="text-xs text-text-gray dark:text-slate-400">Looking up customer…</p>}
          {resolvedCustomerId && !lookupLoading && <p className="text-xs font-semibold text-teal">Returning customer — details auto-filled</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cbm-name">Customer name</Label>
              <Input id="cbm-name" value={form.name} disabled={!!resolvedCustomerId} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="cbm-email">Email</Label>
              <Input id="cbm-email" type="email" value={form.email} disabled={!!resolvedCustomerId} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="cbm-vehicle">Vehicle</Label>
            <Input id="cbm-vehicle" value={form.vehicle} onChange={(e) => setForm((f) => ({ ...f, vehicle: e.target.value }))} placeholder="2021 Toyota Camry" />
          </div>
          <div>
            <Label htmlFor="cbm-notes">Notes (optional)</Label>
            <Textarea id="cbm-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      }
    </Modal>);

}
