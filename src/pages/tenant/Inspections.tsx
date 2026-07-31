import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CameraIcon, CalendarIcon, UserIcon, PlayIcon, ClipboardCheckIcon, PlusIcon, UploadIcon, XIcon, CopyIcon, Loader2Icon, PencilIcon, ThumbsUpIcon, ThumbsDownIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Inspection, InspectionMedia, InspectionResult } from '../../types/inspection';
import { Customer } from '../../types/customer';
import { Technician } from '../../types/technician';
import { JobCard } from '../../types/jobCard';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { uploadInspectionMedia } from '../../lib/inspectionUpload';

const RESULTS: InspectionResult[] = ['Pass', 'Advisory', 'Fail'];

const emptyForm = {
  customerId: '',
  technicianId: '',
  jobCardId: '',
  vehicle: '',
  plate: '',
  result: 'Pass' as InspectionResult,
  notes: '',
  additionalCost: '',
};

export function Inspections() {
  const { user } = useAuth();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Inspection | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [media, setMedia] = useState<InspectionMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [approvalLink, setApprovalLink] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ vehicle: '', plate: '', result: 'Pass' as InspectionResult, notes: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [respondingTo, setRespondingTo] = useState<'approved' | 'rejected' | null>(null);

  const loadInspections = () => {
    api
      .get<{ inspections: Inspection[] }>('/inspections')
      .then(({ inspections }) => setInspections(inspections))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load inspections'))
      .finally(() => setLoading(false));
  };

  useEffect(loadInspections, []);

  useEffect(() => {
    api.get<{ customers: Customer[] }>('/customers').then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([]));
    api.get<{ technicians: Technician[] }>('/technicians').then(({ technicians }) => setTechnicians(technicians)).catch(() => setTechnicians([]));
    api.get<{ jobCards: JobCard[] }>('/job-cards').then(({ jobCards }) => setJobCards(jobCards)).catch(() => setJobCards([]));
  }, []);

  const openCreate = () => {
    setForm({ ...emptyForm, customerId: customers[0]?.id ?? '', technicianId: technicians[0]?.id ?? '' });
    setMedia([]);
    setApprovalLink(null);
    setModalOpen(true);
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0 || !user?.clientId) return;
    setUploading(true);
    for (const file of files) {
      try {
        const uploaded = await uploadInspectionMedia(user.clientId, file);
        setMedia((prev) => [...prev, { ...uploaded, uploadedAt: new Date().toISOString() }]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Failed to upload ${file.name}`);
      }
    }
    setUploading(false);
  };

  const removeMedia = (url: string) => setMedia((prev) => prev.filter((m) => m.url !== url));

  const save = async () => {
    if (!form.customerId || !form.technicianId || !form.vehicle.trim()) {
      toast.error('Customer, technician, and vehicle are required');
      return;
    }
    setSaving(true);
    try {
      const { inspection } = await api.post<{ inspection: Inspection }>('/inspections', {
        customerId: form.customerId,
        technicianId: form.technicianId,
        jobCardId: form.jobCardId || undefined,
        vehicle: form.vehicle,
        plate: form.plate || undefined,
        result: form.result,
        notes: form.notes || undefined,
        media,
        additionalCost: form.additionalCost ? Number(form.additionalCost) : undefined,
      });
      setInspections((prev) => [inspection, ...prev]);
      toast.success('Inspection created');
      if (inspection.approvalToken) {
        setApprovalLink(`${window.location.origin}/approve/${inspection.approvalToken}`);
      } else {
        setModalOpen(false);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create inspection');
    } finally {
      setSaving(false);
    }
  };

  const copyApprovalLink = () => {
    if (!approvalLink) return;
    navigator.clipboard.writeText(approvalLink);
    toast.success('Link copied');
  };

  const openEdit = () => {
    if (!selected) return;
    setEditForm({ vehicle: selected.vehicle, plate: selected.plate ?? '', result: selected.result, notes: selected.notes ?? '' });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!selected || !editForm.vehicle.trim()) {
      toast.error('Vehicle is required');
      return;
    }
    setSavingEdit(true);
    try {
      const { inspection } = await api.patch<{ inspection: Inspection }>(`/inspections/${selected.id}`, {
        vehicle: editForm.vehicle,
        plate: editForm.plate || undefined,
        result: editForm.result,
        notes: editForm.notes || undefined,
      });
      setInspections((prev) => prev.map((i) => (i.id === inspection.id ? inspection : i)));
      setSelected(inspection);
      setEditOpen(false);
      toast.success('Inspection updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update inspection');
    } finally {
      setSavingEdit(false);
    }
  };

  // Manual override for the endpoint's own documented use case: staff
  // records that a customer approved/rejected over the phone or in person,
  // without the customer needing to click the public approval link.
  const respondToApproval = async (decision: 'approved' | 'rejected') => {
    if (!selected) return;
    setRespondingTo(decision);
    try {
      const { inspection } = await api.patch<{ inspection: Inspection }>(`/inspections/${selected.id}`, { approvalStatus: decision });
      setInspections((prev) => prev.map((i) => (i.id === inspection.id ? inspection : i)));
      setSelected(inspection);
      toast.success(`Recorded as ${decision}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record response');
    } finally {
      setRespondingTo(null);
    }
  };

  const shareOnWhatsApp = () => {
    if (!approvalLink) return;
    const msg = encodeURIComponent(`Hi, additional work was found during your vehicle inspection. Please review and approve: ${approvalLink}`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  const noPrereqs = customers.length === 0 || technicians.length === 0;

  return (
    <div>
      <PageHeader
        title="Digital Inspections"
        description="Photo & video inspection reports per vehicle."
        action={
        <Button onClick={openCreate} disabled={noPrereqs}>
            <PlusIcon className="h-4 w-4" /> New inspection
          </Button>
        } />


      {noPrereqs &&
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          You need at least one {customers.length === 0 && technicians.length === 0 ? 'customer and one technician' : customers.length === 0 ? 'customer' : 'technician'} before you can create an inspection.
        </div>
      }

      {loading ?
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) =>
        <Card key={i} className="overflow-hidden">
              <Skeleton className="h-44 w-full rounded-none" />
              <div className="p-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-24" />
              </div>
            </Card>
        )}
        </div> :
      inspections.length === 0 ?
      <Card>
          <EmptyState
          icon={ClipboardCheckIcon}
          title="No inspections yet"
          description="Digital inspection reports will appear here once your technicians start submitting them from the field." />

        </Card> :

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {inspections.map((insp) =>
        <Card key={insp.id} className="group cursor-pointer overflow-hidden transition hover:shadow-soft-lg" onClick={() => setSelected(insp)}>
              <div className="relative h-44 overflow-hidden bg-soft-gray dark:bg-slate-800">
                {insp.media[0] ?
              insp.media[0].type === 'video' ?
              <video src={insp.media[0].url} className="h-full w-full object-cover" muted /> :

              <img src={insp.media[0].url} alt={`Inspection of ${insp.vehicle}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> :


              <div className="flex h-full w-full items-center justify-center text-slate-300 dark:text-slate-600">
                    <CameraIcon className="h-10 w-10" />
                  </div>
              }
                <div className="absolute inset-0 bg-gradient-to-t from-navy/60 to-transparent" />
                <div className="absolute left-3 top-3">
                  <StatusBadge status={insp.result} />
                </div>
                <div className="absolute bottom-3 left-3 flex items-center gap-2 text-white">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 backdrop-blur">
                    <PlayIcon className="h-4 w-4" />
                  </span>
                  <span className="text-xs font-semibold">{insp.media.length} file{insp.media.length === 1 ? '' : 's'}</span>
                </div>
                {insp.approvalStatus !== 'not_required' &&
              <div className="absolute right-3 top-3">
                    <Badge tone={insp.approvalStatus === 'approved' ? 'green' : insp.approvalStatus === 'rejected' ? 'red' : 'amber'}>
                      {insp.approvalStatus === 'pending' ? 'Awaiting approval' : insp.approvalStatus}
                    </Badge>
                  </div>
              }
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-navy dark:text-slate-100">{insp.vehicle}</p>
                  <span className="text-xs font-bold text-slate-400">{insp.id}</span>
                </div>
                <p className="text-xs text-text-gray dark:text-slate-400">{insp.plate} · {insp.customer}</p>
                <div className="mt-3 flex items-center gap-3 text-xs text-text-gray dark:text-slate-400">
                  <span className="flex items-center gap-1"><UserIcon className="h-3 w-3" /> {insp.technician}</span>
                  <span className="flex items-center gap-1"><CalendarIcon className="h-3 w-3" /> {formatDate(insp.date)}</span>
                </div>
              </div>
            </Card>
        )}
        </div>
      }

      {/* Detail modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.id} — ${selected.vehicle}` : ''}
        size="lg"
        footer={
        <Button variant="secondary" onClick={openEdit}>
            <PencilIcon className="h-4 w-4" /> Edit
          </Button>
        }>

        {selected &&
        <div>
            {selected.media.length > 0 ?
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {selected.media.map((m) =>
            m.type === 'video' ?
            <video key={m.url} src={m.url} controls className="h-32 w-full rounded-xl object-cover" /> :

            <img key={m.url} src={m.url} alt={`Inspection of ${selected.vehicle}`} className="h-32 w-full rounded-xl object-cover" />

            )}
              </div> :

          <div className="flex h-40 items-center justify-center rounded-xl bg-soft-gray text-slate-300 dark:bg-slate-800 dark:text-slate-600">
                <CameraIcon className="h-10 w-10" />
              </div>
          }
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.result} />
              {selected.plate && <Badge tone="gray"><CameraIcon className="h-3 w-3" /> {selected.plate}</Badge>}
              {selected.approvalStatus !== 'not_required' &&
            <Badge tone={selected.approvalStatus === 'approved' ? 'green' : selected.approvalStatus === 'rejected' ? 'red' : 'amber'}>
                  {selected.approvalStatus === 'pending' ? 'Awaiting customer approval' : `Customer ${selected.approvalStatus}`}
                </Badge>
            }
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-semibold text-text-gray dark:text-slate-400">Customer</p>
                <p className="font-bold text-navy dark:text-slate-100">{selected.customer}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-text-gray dark:text-slate-400">Technician</p>
                <p className="font-bold text-navy dark:text-slate-100">{selected.technician}</p>
              </div>
            </div>
            {selected.notes &&
          <div className="mt-4 rounded-xl bg-soft-gray p-4 dark:bg-slate-800/60">
                <p className="text-xs font-semibold text-text-gray dark:text-slate-400">Technician notes</p>
                <p className="mt-1 text-sm text-navy dark:text-slate-200">{selected.notes}</p>
              </div>
          }
            {selected.approvalToken && selected.approvalStatus === 'pending' &&
          <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
                  <p className="flex-1 truncate text-xs text-amber-800 dark:text-amber-300">
                    {`${window.location.origin}/approve/${selected.approvalToken}`}
                  </p>
                  <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/approve/${selected.approvalToken}`);
                  toast.success('Link copied');
                }}
                className="shrink-0 rounded-lg p-1.5 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900">

                    <CopyIcon className="h-4 w-4" />
                  </button>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold text-text-gray dark:text-slate-400">Or record their response yourself (e.g. approved by phone):</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => respondToApproval('rejected')} loading={respondingTo === 'rejected'} disabled={respondingTo !== null}>
                      <ThumbsDownIcon className="h-4 w-4" /> Mark rejected
                    </Button>
                    <Button onClick={() => respondToApproval('approved')} loading={respondingTo === 'approved'} disabled={respondingTo !== null}>
                      <ThumbsUpIcon className="h-4 w-4" /> Mark approved
                    </Button>
                  </div>
                </div>
              </div>
          }
          </div>
        }
      </Modal>

      {/* Edit modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit inspection"
        footer={
        <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} loading={savingEdit}>Save changes</Button>
          </>
        }>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="edit-vehicle">Vehicle</Label>
            <Input id="edit-vehicle" value={editForm.vehicle} onChange={(e) => setEditForm({ ...editForm, vehicle: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="edit-plate">License plate</Label>
            <Input id="edit-plate" value={editForm.plate} onChange={(e) => setEditForm({ ...editForm, plate: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="edit-result">Result</Label>
            <Select id="edit-result" value={editForm.result} onChange={(e) => setEditForm({ ...editForm, result: e.target.value as InspectionResult })}>
              {RESULTS.map((r) => <option key={r}>{r}</option>)}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="edit-notes">Technician notes</Label>
            <Textarea id="edit-notes" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
          </div>
        </div>
      </Modal>

      {/* Create modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={approvalLink ? 'Approval link ready' : 'New inspection'}
        size="lg"
        footer={
        approvalLink ?
        <Button onClick={() => setModalOpen(false)}>Done</Button> :

        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={uploading}>Create inspection</Button>
          </>

        }>

        {approvalLink ?
        <div>
            <p className="text-sm text-text-gray dark:text-slate-400">
              This inspection needs customer approval for the extra cost. Share this link with them:
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-border-soft p-3 dark:border-slate-800">
              <p className="flex-1 truncate text-xs text-navy dark:text-slate-200">{approvalLink}</p>
              <button type="button" onClick={copyApprovalLink} className="shrink-0 rounded-lg p-1.5 text-royal hover:bg-light-blue dark:text-blue-300 dark:hover:bg-slate-800">
                <CopyIcon className="h-4 w-4" />
              </button>
            </div>
            <Button variant="outline" className="mt-3 w-full" onClick={shareOnWhatsApp}>Share via WhatsApp</Button>
          </div> :

        <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="insp-customer">Customer</Label>
                <Select id="insp-customer" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="insp-tech">Technician</Label>
                <Select id="insp-tech" value={form.technicianId} onChange={(e) => setForm({ ...form, technicianId: e.target.value })}>
                  {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="insp-job">Job card (optional)</Label>
                <Select id="insp-job" value={form.jobCardId} onChange={(e) => setForm({ ...form, jobCardId: e.target.value })}>
                  <option value="">— none —</option>
                  {jobCards.map((j) => <option key={j.id} value={j.id}>{j.id} — {j.vehicle}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="insp-vehicle">Vehicle</Label>
                <Input id="insp-vehicle" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} placeholder="2021 Toyota Camry" />
              </div>
              <div>
                <Label htmlFor="insp-plate">License plate</Label>
                <Input id="insp-plate" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="ABC-1234" />
              </div>
              <div>
                <Label htmlFor="insp-result">Result</Label>
                <Select id="insp-result" value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value as InspectionResult })}>
                  {RESULTS.map((r) => <option key={r}>{r}</option>)}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="insp-notes">Technician notes</Label>
                <Textarea id="insp-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="What did you find?" />
              </div>
              <div>
                <Label htmlFor="insp-cost">Extra cost needing approval ($)</Label>
                <Input id="insp-cost" type="number" value={form.additionalCost} onChange={(e) => setForm({ ...form, additionalCost: e.target.value })} placeholder="Leave blank if none" />
              </div>
            </div>

            <div className="mt-4">
              <Label>Photos & videos</Label>
              <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleFiles} className="hidden" />
              <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-4 text-sm font-semibold text-text-gray transition hover:border-bright-blue hover:text-bright-blue disabled:opacity-60 dark:border-slate-700 dark:text-slate-400">

                {uploading ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <UploadIcon className="h-4 w-4" />}
                {uploading ? 'Uploading…' : 'Add photos or videos'}
              </button>
              {media.length > 0 &&
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {media.map((m) =>
              <div key={m.url} className="group relative h-20 overflow-hidden rounded-lg border border-border-soft dark:border-slate-800">
                      {m.type === 'video' ?
                <video src={m.url} className="h-full w-full object-cover" muted /> :

                <img src={m.url} alt="" className="h-full w-full object-cover" />
                }
                      <button
                  type="button"
                  onClick={() => removeMedia(m.url)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100">

                        <XIcon className="h-3 w-3" />
                      </button>
                    </div>
              )}
                </div>
            }
            </div>
          </>
        }
      </Modal>
    </div>);

}
