import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { UsersIcon, PencilIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea, Label } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Toggle } from '../../components/ui/Toggle';
import { Employee, EmploymentType, EMPLOYMENT_TYPES } from '../../types/employee';
import { Department } from '../../types/department';
import { formatDate, formatCurrency } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useHasPermission } from '../../context/AuthContext';

const emptyForm = {
  dateOfBirth: '',
  address: '',
  nationalId: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  hireDate: '',
  employmentType: 'Full-time' as EmploymentType,
  notes: '',
  hourlyRate: '',
  active: true,
  departmentId: '',
};

export function Employees() {
  // Server-enforced (requireTenantPermission) — UX only, matches every other
  // permission-gated action in this app (Approvals, Staff invite/remove).
  const canEdit = useHasPermission('employees:edit');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadEmployees = () => {
    setLoading(true);
    api
      .get<{ employees: Employee[] }>('/employees')
      .then(({ employees }) => setEmployees(employees))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load employees'))
      .finally(() => setLoading(false));
  };

  useEffect(loadEmployees, []);
  useEffect(() => {
    api.get<{ departments: Department[] }>('/departments').then(({ departments }) => setDepartments(departments)).catch(() => setDepartments([]));
  }, []);

  const departmentNameById = new Map(departments.map((d) => [d.id, d.name]));

  const openEdit = (employee: Employee) => {
    setEditing(employee);
    setForm({
      dateOfBirth: employee.dateOfBirth ? employee.dateOfBirth.slice(0, 10) : '',
      address: employee.address ?? '',
      nationalId: employee.nationalId ?? '',
      emergencyContactName: employee.emergencyContactName ?? '',
      emergencyContactPhone: employee.emergencyContactPhone ?? '',
      hireDate: employee.hireDate ? employee.hireDate.slice(0, 10) : '',
      employmentType: employee.employmentType,
      notes: employee.notes ?? '',
      hourlyRate: employee.hourlyRate != null ? String(employee.hourlyRate) : '',
      active: employee.active,
      departmentId: employee.departmentId ?? '',
    });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { employee } = await api.patch<{ employee: Employee }>(`/employees/${editing.userId}`, {
        ...form,
        dateOfBirth: form.dateOfBirth || undefined,
        hireDate: form.hireDate || undefined,
        hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : null,
        departmentId: form.departmentId || null,
      });
      setEmployees((prev) => prev.map((e) => (e.userId === employee.userId ? employee : e)));
      toast.success(`${employee.name}'s profile updated`);
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Employees" description="HR profile data for every staff member." />

      {loading ?
      <Card><div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div></Card> :
      employees.length === 0 ?
      <Card><EmptyState icon={UsersIcon} title="No staff yet" description="Invite staff under Staff to see them here." /></Card> :

      <Card>
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {employees.map((e) =>
          <li key={e.userId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-navy dark:text-slate-100">{e.name}</p>
                    <Badge tone="gray">{e.tenantRole}</Badge>
                    {!e.hasProfile && <Badge tone="amber">No profile yet</Badge>}
                    {e.hasProfile && !e.active && <Badge tone="red">Inactive</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-text-gray dark:text-slate-400">
                    {e.email}
                    {e.hireDate && ` · Hired ${formatDate(e.hireDate)}`}
                    {e.hasProfile && ` · ${e.employmentType}`}
                    {e.departmentId && ` · ${departmentNameById.get(e.departmentId) ?? 'Unknown department'}`}
                    {e.hourlyRate != null && ` · ${formatCurrency(e.hourlyRate)}/hr`}
                  </p>
                </div>
                {canEdit &&
            <Button size="sm" variant="secondary" onClick={() => openEdit(e)}>
                    <PencilIcon className="h-3.5 w-3.5" /> Edit profile
                  </Button>
            }
              </li>
          )}
          </ul>
        </Card>
      }

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `${editing.name}'s HR profile` : ''}
        size="lg"
        footer={
        <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={saving} onClick={save}>Save profile</Button>
          </>
        }>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="emp-dob">Date of birth</Label>
            <Input id="emp-dob" type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="emp-hire">Hire date</Label>
            <Input id="emp-hire" type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="emp-address">Address</Label>
            <Input id="emp-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="emp-nid">National ID</Label>
            <Input id="emp-nid" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="emp-type">Employment type</Label>
            <Select id="emp-type" value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value as EmploymentType })}>
              {EMPLOYMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="emp-rate">Hourly rate (optional)</Label>
            <Input id="emp-rate" type="number" min={0} placeholder="Used to compute Payroll" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} />
          </div>
          {departments.length > 0 &&
          <div>
              <Label htmlFor="emp-dept">Department (optional)</Label>
              <Select id="emp-dept" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                <option value="">— none —</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </div>
          }
          <div className="flex items-center justify-between rounded-xl border border-border-soft px-3 py-2.5 dark:border-slate-800">
            <Label htmlFor="emp-active">Active (included in payroll)</Label>
            <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} />
          </div>
          <div>
            <Label htmlFor="emp-ec-name">Emergency contact name</Label>
            <Input id="emp-ec-name" value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="emp-ec-phone">Emergency contact phone</Label>
            <Input id="emp-ec-phone" value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="emp-notes">Notes</Label>
            <Textarea id="emp-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>);

}
