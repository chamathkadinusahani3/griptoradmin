import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { MailIcon, LockIcon, ArrowRightIcon, WrenchIcon } from 'lucide-react';
import { useAuth, ApiError } from '../context/AuthContext';
import { Logo } from '../components/layout/Logo';
import { Button } from '../components/ui/Button';
import { Input, Label } from '../components/ui/Input';
import { api } from '../lib/api';
import { resolveBrandPalette, paletteCssVars } from '../data/brandPalettes';

interface TenantBranding {
  name: string;
  branding: { logoDataUrl?: string; paletteId?: string; accentColor?: string };
}

// Bookmarkable per-tenant login (/login/:slug) — cosmetic only, so a
// missing/unknown slug just falls back to generic GRIPTOR branding
// silently rather than blocking sign-in. The actual credential check is
// unchanged: the tenant is still resolved from the authenticated user's
// email, same as generic /login.
//
// `loading` starts true only when a slug is present, so plain /login never
// blocks on it — it's purely there to stop /login/:slug from painting
// generic GRIPTOR branding for a frame before swapping to the tenant's own,
// which reads as a flash of the wrong company's page.
function useTenantBranding(slug: string | undefined) {
  const [tenant, setTenant] = useState<TenantBranding | null>(null);
  const [loading, setLoading] = useState(!!slug);

  useEffect(() => {
    if (!slug) {
      setTenant(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<TenantBranding>(`/public/tenant-branding/${slug}`)
      .then((data) => { if (!cancelled) setTenant(data); })
      .catch(() => { if (!cancelled) setTenant(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  return { tenant, loading };
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { slug } = useParams();
  const { tenant, loading: brandingLoading } = useTenantBranding(slug);
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

  const palette = resolveBrandPalette(tenant?.branding);
  const brandName = tenant?.name ?? 'GRIPTOR';

  if (brandingLoading) {
    return <div className="min-h-screen w-full bg-soft-gray dark:bg-slate-950" />;
  }

  return (
    <div className="flex min-h-screen w-full bg-soft-gray dark:bg-slate-950" style={tenant ? paletteCssVars(palette) : undefined}>
      {/* Left brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-griptor-gradient p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-cyan/20 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            {tenant?.branding.logoDataUrl ?
            <img src={tenant.branding.logoDataUrl} alt={brandName} className="h-9 w-9 shrink-0 rounded-xl bg-white/15 object-contain p-1" /> :

            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                <WrenchIcon className="h-5 w-5" />
              </div>
            }
            <span className="text-lg font-extrabold tracking-tight">{brandName}</span>
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
        <p className="relative text-sm text-white/60">
          {tenant ? `Powered by GRIPTOR — © 2026 GRIPTOR Inc.` : '© 2026 GRIPTOR Inc. All rights reserved.'}
        </p>
      </div>

      {/* Right form */}
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md">

          <div className="mb-8 lg:hidden">
            {tenant?.branding.logoDataUrl ?
            <div className="flex items-center gap-2.5">
                <img src={tenant.branding.logoDataUrl} alt={brandName} className="h-9 w-9 shrink-0 rounded-lg object-contain" />
                <span className="truncate text-base font-extrabold tracking-tight text-navy dark:text-white">{brandName}</span>
              </div> :

            <Logo />
            }
          </div>
          <h2 className="text-2xl font-extrabold text-navy dark:text-slate-100">Welcome back</h2>
          <p className="mt-1 text-sm text-text-gray dark:text-slate-400">
            Sign in to your {brandName} account to continue.
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
