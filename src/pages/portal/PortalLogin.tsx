import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { MailIcon, LockIcon, ArrowRightIcon } from 'lucide-react';
import { Logo } from '../../components/layout/Logo';
import { Button } from '../../components/ui/Button';
import { Input, Label } from '../../components/ui/Input';
import { useCustomerPortal, ApiError } from '../../context/CustomerPortalContext';

export function PortalLogin() {
  const { slug } = useParams();
  const { login } = useCustomerPortal();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug) return;
    setLoading(true);
    try {
      await login(slug, email, password);
      toast.success('Signed in');
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
        <h2 className="text-center text-2xl font-extrabold text-navy dark:text-slate-100">Customer sign in</h2>
        <p className="mt-1 text-center text-sm text-text-gray dark:text-slate-400">
          View your vehicles, service history, and invoices.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="portal-email">Email address</Label>
            <Input id="portal-email" type="email" icon={MailIcon} required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="portal-password">Password</Label>
            <Input id="portal-password" type="password" icon={LockIcon} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" size="lg" loading={loading} className="w-full">
            Sign in
            {!loading && <ArrowRightIcon className="h-4 w-4" />}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-gray dark:text-slate-400">
          New here? <Link to={`/portal/${slug}/register`} className="font-semibold text-royal hover:underline dark:text-blue-300">Create an account</Link>
        </p>
        <p className="mt-2 text-center text-xs text-text-gray dark:text-slate-500">
          No portal account yet? Ask your garage to enable access.
        </p>
      </div>
    </div>);

}
