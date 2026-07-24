








import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { MailIcon, LockIcon, ArrowRightIcon, WrenchIcon } from 'lucide-react';
import { useAuth, ApiError } from '../context/AuthContext';
import { Logo } from '../components/layout/Logo';
import { Button } from '../components/ui/Button';
import { Input, Label } from '../components/ui/Input';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(email, password);
      toast.success('Signed in successfully');
      navigate(user.role === 'super' ? '/admin' : '/app');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-soft-gray dark:bg-slate-950">
      {/* Left brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-griptor-gradient p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-cyan/20 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
              <WrenchIcon className="h-5 w-5" />
            </div>
            <span className="text-lg font-extrabold tracking-tight">GRIPTOR</span>
          </div>
        </div>
        <div className="relative">
          <h1 className="text-4xl font-extrabold leading-tight">
            The operating system for modern garages.
          </h1>
          <p className="mt-4 max-w-md text-white/80">
            Manage job cards, inventory, and customers in one place — or run the whole GRIPTOR platform as a Super Admin.
          </p>
          <div className="mt-8 flex gap-6">
            {[
            { k: '850+', v: 'Garages' },
            { k: '$160k', v: 'ARR' },
            { k: '99.9%', v: 'Uptime' }].
            map((s) =>
            <div key={s.v}>
                <p className="text-2xl font-extrabold">{s.k}</p>
                <p className="text-sm text-white/70">{s.v}</p>
              </div>
            )}
          </div>
        </div>
        <p className="relative text-sm text-white/60">© 2026 GRIPTOR Inc. All rights reserved.</p>
      </div>

      {/* Right form */}
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md">
          
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h2 className="text-2xl font-extrabold text-navy dark:text-slate-100">Welcome back</h2>
          <p className="mt-1 text-sm text-text-gray dark:text-slate-400">
            Sign in to your GRIPTOR account to continue.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                icon={MailIcon}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required />
              
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                icon={LockIcon}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required />
              
            </div>
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-text-gray dark:text-slate-400">
                <input type="checkbox" defaultChecked className="rounded border-border-soft text-royal focus:ring-bright-blue" />
                Remember me
              </label>
              <a href="#" className="font-semibold text-royal hover:underline dark:text-blue-300">
                Forgot password?
              </a>
            </div>
            <Button type="submit" size="lg" loading={loading} className="w-full">
              Sign in
              {!loading && <ArrowRightIcon className="h-4 w-4" />}
            </Button>
          </form>
        </motion.div>
      </div>
    </div>);

}