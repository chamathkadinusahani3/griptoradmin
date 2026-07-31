import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BriefcaseIcon, PlusIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { JobOpening } from '../../types/jobOpening';
import { Candidate, CandidateStatus, CANDIDATE_STATUSES } from '../../types/candidate';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useHasPermission } from '../../context/AuthContext';

const STATUS_TONE: Record<CandidateStatus, 'blue' | 'amber' | 'teal' | 'green' | 'red'> = {
  Applied: 'blue',
  Interviewing: 'amber',
  Offered: 'teal',
  Hired: 'green',
  Rejected: 'red',
};

export function Recruitment() {
  const canManage = useHasPermission('recruitment:manage');
  const [openings, setOpenings] = useState<JobOpening[]>([]);
  const [candidatesByOpening, setCandidatesByOpening] = useState<Record<string, Candidate[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const [openModal, setOpenModal] = useState(false);
  const [openingForm, setOpeningForm] = useState({ title: '', description: '' });
  const [savingOpening, setSavingOpening] = useState(false);

  const [candidateModalFor, setCandidateModalFor] = useState<string | null>(null);
  const [candidateForm, setCandidateForm] = useState({ name: '', email: '', phone: '' });
  const [savingCandidate, setSavingCandidate] = useState(false);

  const loadOpenings = () => {
    api
      .get<{ jobOpenings: JobOpening[] }>('/job-openings')
      .then(({ jobOpenings }) => setOpenings(jobOpenings))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load job openings'));
  };

  useEffect(loadOpenings, []);

  const loadCandidates = (openingId: string) => {
    api
      .get<{ candidates: Candidate[] }>(`/candidates?openingId=${openingId}`)
      .then(({ candidates }) => setCandidatesByOpening((prev) => ({ ...prev, [openingId]: candidates })))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load candidates'));
  };

  const toggleExpand = (opening: JobOpening) => {
    if (expanded === opening.id) {
      setExpanded(null);
      return;
    }
    setExpanded(opening.id);
    if (!candidatesByOpening[opening.id]) loadCandidates(opening.id);
  };

  const createOpening = async () => {
    if (!openingForm.title.trim()) {
      toast.error('A title is required');
      return;
    }
    setSavingOpening(true);
    try {
      const { jobOpening } = await api.post<{ jobOpening: JobOpening }>('/job-openings', openingForm);
      setOpenings((prev) => [jobOpening, ...prev]);
      toast.success(`${jobOpening.title} opened`);
      setOpenModal(false);
      setOpeningForm({ title: '', description: '' });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create job opening');
    } finally {
      setSavingOpening(false);
    }
  };

  const closeOpening = async (opening: JobOpening) => {
    try {
      const { jobOpening } = await api.patch<{ jobOpening: JobOpening }>(`/job-openings/${opening.id}`, { status: 'Closed' });
      setOpenings((prev) => prev.map((o) => (o.id === jobOpening.id ? jobOpening : o)));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to close opening');
    }
  };

  const addCandidate = async () => {
    if (!candidateModalFor || !candidateForm.name.trim()) {
      toast.error('A name is required');
      return;
    }
    setSavingCandidate(true);
    try {
      const { candidate } = await api.post<{ candidate: Candidate }>('/candidates', { openingId: candidateModalFor, ...candidateForm });
      setCandidatesByOpening((prev) => ({ ...prev, [candidateModalFor]: [candidate, ...(prev[candidateModalFor] ?? [])] }));
      setOpenings((prev) => prev.map((o) => (o.id === candidateModalFor ? { ...o, candidateCount: o.candidateCount + 1 } : o)));
      toast.success(`${candidate.name} added`);
      setCandidateModalFor(null);
      setCandidateForm({ name: '', email: '', phone: '' });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add candidate');
    } finally {
      setSavingCandidate(false);
    }
  };

  const setCandidateStatus = async (openingId: string, candidate: Candidate, status: CandidateStatus) => {
    try {
      const { candidate: updated } = await api.patch<{ candidate: Candidate }>(`/candidates/${candidate.id}`, { status });
      setCandidatesByOpening((prev) => ({
        ...prev,
        [openingId]: (prev[openingId] ?? []).map((c) => (c.id === updated.id ? updated : c)),
      }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update candidate');
    }
  };

  return (
    <div>
      <PageHeader
        title="Recruitment"
        description="Job openings and candidates."
        action={canManage ? <Button onClick={() => setOpenModal(true)}><PlusIcon className="h-4 w-4" /> New opening</Button> : undefined} />


      {openings.length === 0 ?
      <Card><EmptyState icon={BriefcaseIcon} title="No job openings yet" description="Open a role to start tracking candidates." /></Card> :

      <div className="space-y-3">
          {openings.map((opening) =>
        <Card key={opening.id}>
              <button type="button" onClick={() => toggleExpand(opening)} className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-navy dark:text-slate-100">{opening.title}</p>
                    <Badge tone={opening.status === 'Open' ? 'green' : 'gray'}>{opening.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{opening.candidateCount} candidate{opening.candidateCount === 1 ? '' : 's'} · {formatDate(opening.createdAt)}</p>
                </div>
                {expanded === opening.id ? <ChevronUpIcon className="h-4 w-4 text-text-gray" /> : <ChevronDownIcon className="h-4 w-4 text-text-gray" />}
              </button>

              {expanded === opening.id &&
          <div className="border-t border-border-soft p-4 dark:border-slate-800">
                  {opening.description && <p className="mb-4 text-sm text-text-gray dark:text-slate-400">{opening.description}</p>}
                  <div className="space-y-2">
                    {(candidatesByOpening[opening.id] ?? []).map((c) =>
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-soft-gray p-3 dark:bg-slate-800/60">
                        <div className="min-w-0">
                          <p className="font-semibold text-navy dark:text-slate-100">{c.name}</p>
                          <p className="text-xs text-text-gray dark:text-slate-400">{c.email}{c.phone ? ` · ${c.phone}` : ''}</p>
                        </div>
                        {canManage ?
                  <Select
                    className="w-40"
                    value={c.status}
                    onChange={(e) => setCandidateStatus(opening.id, c, e.target.value as CandidateStatus)}>

                            {CANDIDATE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </Select> :

                  <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                  }
                      </div>
                )}
                  </div>
                  {canManage &&
            <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setCandidateModalFor(opening.id)}><PlusIcon className="h-3.5 w-3.5" /> Add candidate</Button>
                      {opening.status === 'Open' && <Button size="sm" variant="ghost" onClick={() => closeOpening(opening)}>Close opening</Button>}
                    </div>
            }
                </div>
          }
            </Card>
        )}
        </div>
      }

      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title="New job opening"
        footer={
        <>
            <Button variant="secondary" onClick={() => setOpenModal(false)}>Cancel</Button>
            <Button loading={savingOpening} onClick={createOpening}>Create</Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="jo-title">Title</Label>
            <Input id="jo-title" value={openingForm.title} onChange={(e) => setOpeningForm({ ...openingForm, title: e.target.value })} placeholder="e.g. Senior Technician" />
          </div>
          <div>
            <Label htmlFor="jo-desc">Description (optional)</Label>
            <Textarea id="jo-desc" value={openingForm.description} onChange={(e) => setOpeningForm({ ...openingForm, description: e.target.value })} />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!candidateModalFor}
        onClose={() => setCandidateModalFor(null)}
        title="Add candidate"
        footer={
        <>
            <Button variant="secondary" onClick={() => setCandidateModalFor(null)}>Cancel</Button>
            <Button loading={savingCandidate} onClick={addCandidate}>Add</Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="cand-name">Name</Label>
            <Input id="cand-name" value={candidateForm.name} onChange={(e) => setCandidateForm({ ...candidateForm, name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="cand-email">Email (optional)</Label>
            <Input id="cand-email" type="email" value={candidateForm.email} onChange={(e) => setCandidateForm({ ...candidateForm, email: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="cand-phone">Phone (optional)</Label>
            <Input id="cand-phone" value={candidateForm.phone} onChange={(e) => setCandidateForm({ ...candidateForm, phone: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>);

}
