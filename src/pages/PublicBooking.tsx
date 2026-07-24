import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2Icon, XCircleIcon, ArrowLeftIcon, ArrowRightIcon, ClockIcon, CalendarIcon } from 'lucide-react';
import { Logo } from '../components/layout/Logo';
import { Button } from '../components/ui/Button';
import { Input, Label, Select } from '../components/ui/Input';
import { PublicBookingInfo, AvailabilitySlot } from '../types/booking';
import { api, ApiError } from '../lib/api';

type Step = 'services' | 'date' | 'time' | 'details' | 'confirmation';
const STEPS: Step[] = ['services', 'date', 'time', 'details', 'confirmation'];

const emptyDetails = { name: '', email: '', phone: '', vehicle: '', plate: '', branchId: '' };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function PublicBooking() {
  const { slug } = useParams();
  const [info, setInfo] = useState<PublicBookingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [step, setStep] = useState<Step>('services');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [date, setDate] = useState(todayStr());
  const [timeSlot, setTimeSlot] = useState<string | null>(null);
  const [details, setDetails] = useState(emptyDetails);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!slug) return;
    api
      .get<PublicBookingInfo>(`/public/bookings/${slug}`)
      .then((data) => {
        setInfo(data);
        const defaultBranch = data.branches.find((b) => b.isDefault);
        if (defaultBranch) setDetails((d) => ({ ...d, branchId: defaultBranch.id }));
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (step !== 'time' || !slug) return;
    setLoadingSlots(true);
    setTimeSlot(null);
    api
      .get<{ slots: AvailabilitySlot[] }>(`/public/bookings/${slug}/availability?date=${date}`)
      .then(({ slots }) => setSlots(slots))
      .catch(() => toast.error('Could not load availability'))
      .finally(() => setLoadingSlots(false));
  }, [step, date, slug]);

  const stepIndex = STEPS.indexOf(step);
  const goNext = () => setStep(STEPS[stepIndex + 1]);
  const goBack = () => setStep(STEPS[stepIndex - 1]);

  const toggleService = (id: string) => {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const canGoNext =
    step === 'services' ? serviceIds.length > 0 :
    step === 'date' ? !!date :
    step === 'time' ? !!timeSlot :
    step === 'details' ? !!(details.name && details.email && details.phone && details.vehicle && (!info || info.branches.length <= 1 || details.branchId)) :
    true;

  const submit = async () => {
    if (!slug) return;
    setSubmitting(true);
    try {
      await api.post(`/public/bookings/${slug}`, { serviceIds, date, timeSlot, ...details });
      setConfirmed(true);
      setStep('confirmation');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to submit booking');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-soft-gray p-6 dark:bg-slate-950">
      <div className="w-full max-w-lg rounded-3xl border border-border-soft bg-white p-8 shadow-soft-lg dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 flex justify-center"><Logo /></div>

        {loading && <p className="text-center text-sm text-text-gray dark:text-slate-400">Loading…</p>}

        {!loading && (notFound || !info) &&
        <div className="text-center">
            <XCircleIcon className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 font-bold text-navy dark:text-slate-100">Booking page not found</p>
          </div>
        }

        {!loading && info &&
        <div>
            <h1 className="text-center text-xl font-extrabold text-navy dark:text-slate-100">Book an Appointment</h1>
            <p className="mt-1 text-center text-sm text-text-gray dark:text-slate-400">{info.clientName}</p>

            {step !== 'confirmation' &&
          <div className="mt-5 flex items-center justify-center gap-1.5">
                {STEPS.slice(0, 4).map((s, i) =>
            <span key={s} className={`h-1.5 w-8 rounded-full ${i <= stepIndex ? 'bg-griptor-gradient' : 'bg-slate-200 dark:bg-slate-700'}`} />
            )}
              </div>
          }

            {step === 'services' &&
          <div className="mt-6">
                <Label>What do you need done?</Label>
                <div className="flex flex-wrap gap-2">
                  {info.services.map((s) =>
              <button
                key={s.id}
                type="button"
                onClick={() => toggleService(s.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${serviceIds.includes(s.id) ? 'bg-griptor-gradient text-white' : 'bg-soft-gray text-text-gray hover:bg-light-blue dark:bg-slate-800 dark:text-slate-300'}`}>

                      {s.name}
                    </button>
              )}
                </div>
                {info.services.length === 0 && <p className="mt-2 text-sm text-text-gray dark:text-slate-400">This garage hasn't listed any services yet.</p>}
              </div>
          }

            {step === 'date' &&
          <div className="mt-6">
                <Label htmlFor="pb-date">Pick a date</Label>
                <Input id="pb-date" type="date" min={todayStr()} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
          }

            {step === 'time' &&
          <div className="mt-6">
                <Label>Pick a time</Label>
                {loadingSlots ?
            <p className="text-sm text-text-gray dark:text-slate-400">Checking availability…</p> :

            <div className="grid grid-cols-3 gap-2">
                    {slots.map((s) =>
              <button
                key={s.time}
                type="button"
                disabled={!s.available}
                onClick={() => setTimeSlot(s.time)}
                className={`flex items-center justify-center gap-1 rounded-xl border px-2 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${timeSlot === s.time ? 'border-teal bg-griptor-gradient text-white' : 'border-border-soft text-navy hover:border-teal dark:border-slate-700 dark:text-slate-200'}`}>

                        <ClockIcon className="h-3.5 w-3.5" /> {s.time}
                      </button>
              )}
                  </div>
            }
              </div>
          }

            {step === 'details' &&
          <div className="mt-6 space-y-4">
                {info.branches.length > 1 &&
            <div>
                    <Label htmlFor="pb-branch">Which branch?</Label>
                    <Select id="pb-branch" value={details.branchId} onChange={(e) => setDetails({ ...details, branchId: e.target.value })}>
                      <option value="">— select a branch —</option>
                      {info.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </div>
            }
                <div>
                  <Label htmlFor="pb-name">Full name</Label>
                  <Input id="pb-name" value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="pb-email">Email</Label>
                  <Input id="pb-email" type="email" value={details.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="pb-phone">Phone</Label>
                  <Input id="pb-phone" value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="pb-vehicle">Vehicle</Label>
                  <Input id="pb-vehicle" placeholder="2021 Toyota Camry" value={details.vehicle} onChange={(e) => setDetails({ ...details, vehicle: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="pb-plate">License plate (optional)</Label>
                  <Input id="pb-plate" value={details.plate} onChange={(e) => setDetails({ ...details, plate: e.target.value })} />
                </div>
              </div>
          }

            {step === 'confirmation' && confirmed &&
          <div className="mt-6 text-center">
                <CheckCircle2Icon className="mx-auto h-12 w-12 text-emerald-500" />
                <p className="mt-3 font-bold text-navy dark:text-slate-100">Booking requested!</p>
                <p className="mt-1 text-sm text-text-gray dark:text-slate-400">
                  {info.clientName} will see your request for <strong>{date}</strong> at <strong>{timeSlot}</strong>. They'll confirm it shortly.
                </p>
              </div>
          }

            {step !== 'confirmation' &&
          <div className="mt-8 flex items-center justify-between">
                <Button variant="ghost" onClick={goBack} disabled={stepIndex === 0}>
                  <ArrowLeftIcon className="h-4 w-4" /> Back
                </Button>
                {step === 'details' ?
            <Button onClick={submit} loading={submitting} disabled={!canGoNext}>
                    <CalendarIcon className="h-4 w-4" /> Request booking
                  </Button> :

            <Button onClick={goNext} disabled={!canGoNext}>
                    Next <ArrowRightIcon className="h-4 w-4" />
                  </Button>
            }
              </div>
          }
          </div>
        }
      </div>
    </div>);

}
