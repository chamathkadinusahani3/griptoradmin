import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';

export type Role = 'super' | 'tenant';

export interface NotificationPrefs {
  newLeads: boolean;
  failedPayments: boolean;
  newTickets: boolean;
  weeklyDigest: boolean;
  productUpdates: boolean;
}

export interface Branding {
  paletteId: string;
  logoDataUrl?: string;
  defaultMode: 'light' | 'dark';
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
  /** For tenant users: their garage's Client document id (used to scope e.g. Blob upload paths). */
  clientId?: string;
  /** For tenant users: the garage they belong to */
  garageName?: string;
  /** For tenant users: their garage's public booking-page slug (/book/:slug). */
  garageSlug?: string;
  /** For tenant users: their garage's active modules/add-ons. */
  modules?: string[];
  addOns?: string[];
  /** For tenant users: their garage's color palette/logo/default theme. */
  branding?: Branding;
  /** For super-admin team members: 'Invited' until their first successful login. */
  status?: 'Active' | 'Invited';
  /** For super-admin team members: Owner/Admin/Support/Billing. */
  teamRole?: 'Owner' | 'Admin' | 'Support' | 'Billing';
  /** For tenant staff: their own sub-role — defaults to 'Owner' server-side for every pre-existing single-login garage. */
  tenantRole?: 'Owner' | 'Manager' | 'Technician' | 'Cashier';
  /** For tenant staff: optional pin to one branch. */
  branchId?: string;
  notificationPrefs?: NotificationPrefs;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** True while the initial session check (GET /api/auth/me) is in flight. */
  bootstrapping: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /** Re-fetches /auth/me and updates `user` — call after a tenant self-service change (e.g. branding) so it takes effect without a full page reload. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    api
      .get<{ user: AuthUser }>('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setBootstrapping(false));
  }, []);

  const refreshUser = async () => {
    try {
      const { user: next } = await api.get<{ user: AuthUser }>('/auth/me');
      setUser(next);
    } catch {
      // Best-effort — keep the previously loaded user if this fails.
    }
  };

  const login = async (email: string, password: string): Promise<AuthUser> => {
    const { user: next } = await api.post<{ user: AuthUser }>('/auth/login', { email, password });
    setUser(next);
    return next;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Best-effort: clear local state even if the request fails.
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, bootstrapping, login, logout, refreshUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { ApiError };
