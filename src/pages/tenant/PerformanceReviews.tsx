import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { TrendingUpIcon, PlusIcon, StarIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { PerformanceReview } from '../../types/performanceReview';
import { formatDate } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useHasPermission } from '../../context/AuthContext';

interface StaffOption {
  userId: string;
  name: string;
}

const emptyForm = { employeeUserId: '', reviewDate: '', rating: '5', feedback: '' };

export function PerformanceReviews() {
  const canReview = useHasPermission('performance-reviews:create');
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadReviews = () => {
    api
      .get<{ performanceReviews: PerformanceReview[] }>('/performance-reviews')
      .then(({ performanceReviews }) => setReviews(performanceReviews))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load performance reviews'));
  };

  useEffect(loadReviews, []);

  useEffect(() => {
    if (!canReview) return;
    api
      .get<{ employees: StaffOption[] }>('/employees')
      .then(({ employees }) => setStaff(employees))
      .catch(() => setStaff([]));
  }, [canReview]);

  const openCreate = () => {
    setForm({ ...emptyForm, employeeUserId: staff[0]?.userId ?? '', reviewDate: new Date().toISOString().slice(0, 10) });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.employeeUserId || !form.reviewDate || !form.feedback.trim()) {
      toast.error('Employee, date, and feedback are required');
      return;
    }
    setSaving(true);
    try {
      const { performanceReview } = await api.post<{ performanceReview: PerformanceReview }>('/performance-reviews', {
        ...form,
        rating: Number(form.rating),
      });
      setReviews((prev) => [performanceReview, ...prev]);
      toast.success('Review submitted');
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to submit review');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Performance"
        description="Periodic reviews — rating and feedback history."
        action={canReview ? <Button onClick={openCreate}><PlusIcon className="h-4 w-4" /> New review</Button> : undefined} />


      {reviews.length === 0 ?
      <Card><EmptyState icon={TrendingUpIcon} title="No reviews yet" description="Submit the first performance review to get started." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {reviews.map((r) =>
          <li key={r.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-navy dark:text-slate-100">{r.employeeName ?? 'Unknown'}</p>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) =>
                <StarIcon key={i} className={`h-4 w-4 ${i < r.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-700'}`} />
                )}
                  </div>
                </div>
                <p className="mt-1 text-xs text-text-gray dark:text-slate-400">{formatDate(r.reviewDate)} · Reviewed by {r.reviewedByName ?? 'Unknown'}</p>
                <p className="mt-2 text-sm text-navy dark:text-slate-200">{r.feedback}</p>
              </li>
          )}
          </ul>
        </Card>
      }

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New performance review"
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={save}>Submit</Button>
          </>
        }>

        <div className="space-y-4">
          <div>
            <Label htmlFor="pr-employee">Employee</Label>
            <Select id="pr-employee" value={form.employeeUserId} onChange={(e) => setForm({ ...form, employeeUserId: e.target.value })}>
              {staff.map((s) => <option key={s.userId} value={s.userId}>{s.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pr-date">Review date</Label>
              <Input id="pr-date" type="date" value={form.reviewDate} onChange={(e) => setForm({ ...form, reviewDate: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="pr-rating">Rating</Label>
              <Select id="pr-rating" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })}>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} / 5</option>)}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="pr-feedback">Feedback</Label>
            <Textarea id="pr-feedback" value={form.feedback} onChange={(e) => setForm({ ...form, feedback: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>);

}
