import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BuildingIcon, PlusIcon, PencilIcon, TrashIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Label, Textarea } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { Department } from '../../types/department';
import { api, ApiError } from '../../lib/api';

const emptyForm = { name: '', description: '' };

export function Departments() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadDepartments = () => {
    setLoading(true);
    api
      .get<{ departments: Department[] }>('/departments')
      .then(({ departments }) => setDepartments(departments))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load departments'))
      .finally(() => setLoading(false));
  };

  useEffect(loadDepartments, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (department: Department) => {
    setEditingId(department.id);
    setForm({ name: department.name, description: department.description ?? '' });
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        const { department } = await api.patch<{ department: Department }>(`/departments/${editingId}`, form);
        setDepartments((prev) => prev.map((d) => (d.id === department.id ? department : d)));
        toast.success('Department updated');
      } else {
        const { department } = await api.post<{ department: Department }>('/departments', form);
        setDepartments((prev) => [...prev, department].sort((a, b) => a.name.localeCompare(b.name)));
        toast.success('Department added');
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to ${editingId ? 'update' : 'add'} department`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (department: Department) => {
    setDeletingId(department.id);
    try {
      await api.delete(`/departments/${department.id}`);
      setDepartments((prev) => prev.filter((d) => d.id !== department.id));
      toast.success('Department removed');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove department');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Departments"
        description="Organizational groupings for staff, used across HR and reporting."
        action={<Button onClick={openCreate}><PlusIcon className="h-4 w-4" /> Add department</Button>} />


      {loading ?
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CardSkeleton /><CardSkeleton />
        </div> :
      departments.length === 0 ?
      <Card><EmptyState icon={BuildingIcon} title="No departments yet" description="Add a department to start grouping staff for HR and reporting." /></Card> :

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {departments.map((d) =>
        <Card key={d.id} className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-light-blue text-teal dark:bg-teal/15">
                <BuildingIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-navy dark:text-slate-100">{d.name}</p>
                {d.description && <p className="truncate text-sm text-text-gray dark:text-slate-400">{d.description}</p>}
              </div>
              <button onClick={() => openEdit(d)} aria-label={`Edit ${d.name}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-soft-gray hover:text-navy dark:hover:bg-slate-800 dark:hover:text-slate-100">
                <PencilIcon className="h-4 w-4" />
              </button>
              <button onClick={() => remove(d)} disabled={deletingId === d.id} aria-label={`Remove ${d.name}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-400">
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          </Card>
        )}
      </div>
      }

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit department' : 'Add department'}
        footer={
        <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button form="department-form" type="submit" loading={saving}>{editingId ? 'Save changes' : 'Add department'}</Button>
          </>
        }>
        <form id="department-form" onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="dept-name">Name</Label>
            <Input id="dept-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="dept-description">Description (optional)</Label>
            <Textarea id="dept-description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>);

}
