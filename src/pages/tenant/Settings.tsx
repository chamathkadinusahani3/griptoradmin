import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ImageIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Label } from '../../components/ui/Input';
import { Toggle } from '../../components/ui/Toggle';
import { BRAND_PALETTES } from '../../data/brandPalettes';
import { cn } from '../../lib/utils';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Client } from '../../types/client';

/** Downscales an uploaded logo before it's stored as a base64 data URL — same approach as ClientDetail.tsx's super-admin branding editor. */
function resizeImageToDataUrl(file: File, maxDim = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read image'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function Settings() {
  const { user, refreshUser } = useAuth();
  const canEdit = !user?.tenantRole || user.tenantRole === 'Owner' || user.tenantRole === 'Manager';

  const [garage, setGarage] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [paletteId, setPaletteId] = useState('blue');
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined);
  const [defaultMode, setDefaultMode] = useState<'light' | 'dark'>('light');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);

  useEffect(() => {
    api
      .get<{ client: Client }>('/tenant/me')
      .then(({ client }) => {
        setGarage(client);
        setName(client.name);
        setContact(client.contact);
        setEmail(client.email);
        setPaletteId(client.branding.paletteId);
        setLogoDataUrl(client.branding.logoDataUrl);
        setDefaultMode(client.branding.defaultMode);
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      if (dataUrl.length > 400_000) {
        toast.error('That image is still too large after resizing — try a simpler logo.');
        return;
      }
      setLogoDataUrl(dataUrl);
    } catch {
      toast.error('Could not read that image file.');
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const { client: updated } = await api.patch<{ client: Client }>('/tenant/settings', { name, contact, email });
      setGarage(updated);
      toast.success('Garage profile updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const saveBranding = async () => {
    setSavingBranding(true);
    try {
      const { client: updated } = await api.patch<{ client: Client }>('/tenant/settings', {
        branding: { paletteId, logoDataUrl: logoDataUrl ?? null, defaultMode },
      });
      setGarage(updated);
      await refreshUser();
      toast.success('Branding updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update branding');
    } finally {
      setSavingBranding(false);
    }
  };

  if (loading || !garage) return null;

  return (
    <div>
      <PageHeader title="Settings" description="Your garage's profile and branding" />

      {!canEdit && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          Only an Owner or Manager can change these settings.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Garage profile" subtitle="Shown to your customers and staff" />
          <div className="space-y-4 p-5">
            <div>
              <Label htmlFor="garage-name">Garage name</Label>
              <Input id="garage-name" value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="garage-contact">Contact name</Label>
              <Input id="garage-contact" value={contact} disabled={!canEdit} onChange={(e) => setContact(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="garage-email">Email</Label>
              <Input id="garage-email" type="email" value={email} disabled={!canEdit} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {canEdit && (
              <Button loading={savingProfile} onClick={saveProfile}>
                Save profile
              </Button>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Branding" subtitle="Your dashboard's color palette, logo, and default theme" />
          <div className="space-y-5 p-5">
            <div>
              <Label>Color palette</Label>
              <div className="grid grid-cols-3 gap-3">
                {BRAND_PALETTES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setPaletteId(p.id)}
                    className={cn(
                      'rounded-xl border-2 p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
                      paletteId === p.id
                        ? 'border-teal ring-2 ring-teal/30'
                        : 'border-border-soft hover:border-teal/50 dark:border-slate-800'
                    )}
                  >
                    <div
                      className="h-8 w-full rounded-lg"
                      style={{
                        background: `linear-gradient(135deg, ${p.colors.navy}, ${p.colors.royal}, ${p.colors.teal}, ${p.colors.cyan})`,
                      }}
                    />
                    <p className="mt-1.5 text-xs font-semibold text-navy dark:text-slate-200">{p.label}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="logo-input">Logo</Label>
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-soft bg-soft-gray dark:border-slate-800 dark:bg-slate-800">
                  {logoDataUrl ? (
                    <img src={logoDataUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-text-gray dark:text-slate-500" />
                  )}
                </div>
                <div className="flex-1">
                  <input
                    id="logo-input"
                    type="file"
                    accept="image/*"
                    disabled={!canEdit}
                    onChange={handleLogoChange}
                    className="block w-full text-sm text-text-gray file:mr-3 file:rounded-lg file:border-0 file:bg-light-blue file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-royal disabled:opacity-60 dark:text-slate-400"
                  />
                  {logoDataUrl && canEdit && (
                    <button
                      type="button"
                      onClick={() => setLogoDataUrl(undefined)}
                      className="mt-1.5 text-xs font-semibold text-red-600 hover:underline"
                    >
                      Remove logo
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Default theme</Label>
                <p className="text-xs text-text-gray dark:text-slate-400">First-time appearance for your staff.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-text-gray dark:text-slate-400">
                  {defaultMode === 'dark' ? 'Dark' : 'Light'}
                </span>
                <Toggle checked={defaultMode === 'dark'} disabled={!canEdit} onChange={(next) => setDefaultMode(next ? 'dark' : 'light')} />
              </div>
            </div>

            {canEdit && (
              <Button loading={savingBranding} onClick={saveBranding}>
                Save branding
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
