import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { UserIcon, MailIcon, PhoneIcon, LockIcon, ArrowRightIcon } from 'lucide-react';
import { Logo } from '../../components/layout/Logo';
import { Button } from '../../components/ui/Button';
import { Input, Label } from '../../components/ui/Input';
import { useCustomerPortal, ApiError } from '../../context/CustomerPortalContext';

const emptyForm = { name: '', email: '', phone: '', password: '' };

export function PortalRegister() {
  const { slug } = useParams();
  const { register } = useCustomerPortal();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug) return;
    setLoading(true);
    try {
      await register(slug, form);
      toast.success('Account created');
      navigate(`/portal/${slug}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-soft-gray p-6 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-3xl border border-border-soft bg-white p-8 shadow-soft-lg dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <h2 className="text-center text-2xl font-extrabold text-navy dark:text-slate-100">Create your account</h2>
        <p className="mt-1 text-center text-sm text-text-gray dark:text-slate-400">
          Track your vehicles, bookings, and invoices online.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="reg-name">Full name</Label>
            <Input id="reg-name" icon={UserIcon} required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="reg-email">Email address</Label>
            <Input id="reg-email" type="email" icon={MailIcon} required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="reg-phone">Phone</Label>
            <Input id="reg-phone" icon={PhoneIcon} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="reg-password">Password</Label>
            <Input id="reg-password" type="password" icon={LockIcon} required minLength={8} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            <p className="mt-1 text-xs text-text-gray dark:text-slate-500">At least 8 characters.</p>
          </div>
          <Button type="submit" size="lg" loading={loading} className="w-full">
            Create account
            {!loading && <ArrowRightIcon className="h-4 w-4" />}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-gray dark:text-slate-400">
          Already have an account? <Link to={`/portal/${slug}/login`} className="font-semibold text-royal hover:underline dark:text-blue-300">Sign in</Link>
        </p>
      </div>
    </div>);

}
