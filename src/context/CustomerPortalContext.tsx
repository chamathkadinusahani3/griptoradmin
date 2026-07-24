import React, { createContext, useContext, useEffect, useState } from 'react';
import { Customer } from '../types/customer';
import { api, ApiError } from '../lib/api';

// A separate identity space from AuthContext (staff) — backed by its own
// cookie (griptor_customer_session, see api/_lib/auth.ts) and its own
// /api/customer-portal/me session check, so a staff session and a
// customer's portal session coexist independently in the same browser.
interface PortalContextValue {
  customer: Customer | null;
  garageName?: string;
  garageSlug?: string;
  bootstrapping: boolean;
  login: (slug: string, email: string, password: string) => Promise<void>;
  register: (slug: string, data: { name: string; email: string; phone?: string; password: string }) => Promise<void>;
  logout: (slug: string) => Promise<void>;
}

const CustomerPortalContext = createContext<PortalContextValue | undefined>(undefined);

interface MeResponse {
  customer: Customer;
  garageName?: string;
  garageSlug?: string;
}

export function CustomerPortalProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [garageName, setGarageName] = useState<string | undefined>(undefined);
  const [garageSlug, setGarageSlug] = useState<string | undefined>(undefined);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    api
      .get<MeResponse>('/customer-portal/me')
      .then(({ customer, garageName, garageSlug }) => {
        setCustomer(customer);
        setGarageName(garageName);
        setGarageSlug(garageSlug);
      })
      .catch(() => setCustomer(null))
      .finally(() => setBootstrapping(false));
  }, []);

  const login = async (slug: string, email: string, password: string) => {
    const { customer, garageName } = await api.post<MeResponse>(`/public/portal/${slug}/login`, { email, password });
    setCustomer(customer);
    setGarageName(garageName);
    setGarageSlug(slug);
  };

  const register = async (slug: string, data: { name: string; email: string; phone?: string; password: string }) => {
    const { customer, garageName } = await api.post<MeResponse>(`/public/portal/${slug}/register`, data);
    setCustomer(customer);
    setGarageName(garageName);
    setGarageSlug(slug);
  };

  const logout = async (slug: string) => {
    try {
      await api.post(`/public/portal/${slug}/logout`);
    } catch {
      // Best-effort: clear local state even if the request fails.
    }
    setCustomer(null);
  };

  return (
    <CustomerPortalContext.Provider value={{ customer, garageName, garageSlug, bootstrapping, login, register, logout }}>
      {children}
    </CustomerPortalContext.Provider>
  );
}

export function useCustomerPortal(): PortalContextValue {
  const ctx = useContext(CustomerPortalContext);
  if (!ctx) throw new Error('useCustomerPortal must be used within CustomerPortalProvider');
  return ctx;
}

export { ApiError };
