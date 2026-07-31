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
  accentColor?: string;
  sidebarStyle: 'expanded' | 'compact';
  fontFamily: string;
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
  /** DEPRECATED — superseded by roleId/roleName/permissions/isOwner below. Kept only so any not-yet-migrated read still sees a sane value during the phased RBAC rollout. */
  tenantRole?: 'Owner' | 'Manager' | 'Technician' | 'Cashier' | 'Sales Executive';
  /** For tenant staff: their custom Role (api/_lib/models/Role.ts). */
  roleId?: string;
  roleName?: string;
  /** The full permission list for this staff member's Role — only present on /auth/me and /auth/login responses (not on every /staff list row, to avoid N+1 lookups server-side). */
  permissions?: string[];
  /** True only for the tenant's single protected Owner role — always has every permission, regardless of what's in `permissions`. */
  isOwner?: boolean;
  /** Only meaningful when the staff member's Role has requiresCreditLimit — their personal credit-exposure cap for corporate customers. */
  creditLimit?: number;
  /** For tenant staff: optional pin to one branch. */
  branchId?: string;
  notificationPrefs?: NotificationPrefs;
  /** Only present on a tenant session started via clients/[id]/impersonate.ts — the Super Admin User id currently impersonating this tenant. */
  impersonatedBy?: string;
  /** The impersonating Super Admin's display name, resolved server-side for the UI banner. */
  impersonatorName?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** True while the initial session check (GET /api/auth/me) is in flight. */
  bootstrapping: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /** Re-fetches /auth/me and updates `user` — call after a tenant self-service change (e.g. branding) so it takes effect without a full page reload. */
  refreshUser: () => Promise<void>;
  /** Ends an active impersonation session (see clients/[id]/impersonate.ts) — restores the Super Admin's own session and updates `user` back to them. No-op-safe if not currently impersonating. */
  exitImpersonation: () => Promise<void>;
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

  const exitImpersonation = async () => {
    try {
      const { user: next } = await api.post<{ ok: boolean; restored: boolean; user?: AuthUser }>('/auth/exit-impersonation');
      setUser(next ?? null);
    } catch {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, bootstrapping, login, logout, refreshUser, exitImpersonation }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/**
 * The one shared permission check every tenant page should use instead of
 * locally redeclaring `user?.tenantRole === 'Owner' || 'Manager'` — mirrors
 * the backend's requireTenantPermission()/hasPermission() short-circuit
 * (Owner always passes, regardless of what's in `permissions`). This is
 * UX-only, same as every one of these frontend gates always was — the real
 * enforcement is server-side.
 */
export function useHasPermission(permission: string): boolean {
  const { user } = useAuth();
  if (!user) return false;
  if (user.isOwner) return true;
  return user.permissions?.includes(permission) ?? false;
}

export { ApiError };
