
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider, useAuth, Role } from './context/AuthContext';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { UpgradeCard } from './components/layout/Sidebar';
import { SUPER_NAV, HUB_NAV, buildModuleNav } from './components/layout/navConfig';
import { MODULE_BY_ID } from './data/modules';
import { resolveBrandPalette, paletteCssVars } from './data/brandPalettes';

import { Login } from './pages/Login';
import { PublicInspectionApproval } from './pages/PublicInspectionApproval';
import { PublicBooking } from './pages/PublicBooking';
import { PublicPaymentThankYou } from './pages/PublicPaymentThankYou';
import { PublicPayStart } from './pages/PublicPayStart';
import { CustomerPortalProvider } from './context/CustomerPortalContext';
import { PortalLogin } from './pages/portal/PortalLogin';
import { PortalRegister } from './pages/portal/PortalRegister';
import { PortalDashboard } from './pages/portal/PortalDashboard';

// Super Admin pages
import { SuperDashboard } from './pages/super/SuperDashboard';
import { Clients } from './pages/super/Clients';
import { ClientDetail } from './pages/super/ClientDetail';
import { Subscriptions } from './pages/super/Subscriptions';
import { ModulesPricing } from './pages/super/ModulesPricing';
import { Leads } from './pages/super/Leads';
import { Billing } from './pages/super/Billing';
import { SupportTickets } from './pages/super/SupportTickets';
import { Users } from './pages/super/Users';
import { SuperSettings } from './pages/super/SuperSettings';

// Tenant pages
import { TenantDashboard } from './pages/tenant/TenantDashboard';
import { JobCards } from './pages/tenant/JobCards';
import { Technicians } from './pages/tenant/Technicians';
import { Inspections } from './pages/tenant/Inspections';
import { Inventory } from './pages/tenant/Inventory';
import { POS } from './pages/tenant/POS';
import { Suppliers } from './pages/tenant/Suppliers';
import { Customers } from './pages/tenant/Customers';
import { Reminders } from './pages/tenant/Reminders';
import { Feedback } from './pages/tenant/Feedback';
import { Bookings } from './pages/tenant/Bookings';
import { BookingServices } from './pages/tenant/BookingServices';
import { Workshop } from './pages/tenant/Workshop';
import { Quotations } from './pages/tenant/Quotations';
import { CustomerInvoices } from './pages/tenant/CustomerInvoices';
import { Reports } from './pages/tenant/Reports';
import { CallLogs } from './pages/tenant/CallLogs';
import { Rewards } from './pages/tenant/Rewards';
import { Approvals } from './pages/tenant/Approvals';
import { Messaging } from './pages/tenant/Messaging';
import { Branches } from './pages/tenant/Branches';
import { Staff } from './pages/tenant/Staff';
import { RolesPermissions } from './pages/tenant/RolesPermissions';
import { Settings } from './pages/tenant/Settings';
import { CorporateAccounts } from './pages/tenant/CorporateAccounts';
import { PurchaseOrders } from './pages/tenant/PurchaseOrders';
import { Expenses } from './pages/tenant/Expenses';
import { Payroll } from './pages/tenant/Payroll';
import { BankAccounts } from './pages/tenant/BankAccounts';
import { Transactions } from './pages/tenant/Transactions';
import { Returns } from './pages/tenant/Returns';
import { Complaints } from './pages/tenant/Complaints';
import { FinancialOverview } from './pages/tenant/FinancialOverview';
import { Sales } from './pages/tenant/Sales';
import { JobReport } from './pages/tenant/JobReport';
import { InventoryReport } from './pages/tenant/InventoryReport';
import { CustomerReport } from './pages/tenant/CustomerReport';
import { InspectionReport } from './pages/tenant/InspectionReport';
import { BookingReport } from './pages/tenant/BookingReport';
import { WorkshopReport } from './pages/tenant/WorkshopReport';
import { AccountingReport } from './pages/tenant/AccountingReport';
import { HrReport } from './pages/tenant/HrReport';
import { PurchaseReport } from './pages/tenant/PurchaseReport';
import { SupplierReport } from './pages/tenant/SupplierReport';
import { ArAging } from './pages/tenant/ArAging';
import { ApAging } from './pages/tenant/ApAging';
import { Employees } from './pages/tenant/Employees';
import { LeaveRequests } from './pages/tenant/LeaveRequests';
import { Attendance } from './pages/tenant/Attendance';
import { Recruitment } from './pages/tenant/Recruitment';
import { PerformanceReviews } from './pages/tenant/PerformanceReviews';
import { Departments } from './pages/tenant/Departments';
import { Warehouses } from './pages/tenant/Warehouses';
import { StockTransfers } from './pages/tenant/StockTransfers';
import { StockAdjustments } from './pages/tenant/StockAdjustments';
import { StockCounts } from './pages/tenant/StockCounts';
import { PurchaseRequisitions } from './pages/tenant/PurchaseRequisitions';
import { RFQs } from './pages/tenant/RFQs';
import { GoodsReceivedNotes } from './pages/tenant/GoodsReceivedNotes';
import { PurchaseInvoices } from './pages/tenant/PurchaseInvoices';
import { SalesOrders } from './pages/tenant/SalesOrders';
import { DeliveryNotes } from './pages/tenant/DeliveryNotes';
import { ChartOfAccounts } from './pages/tenant/ChartOfAccounts';
import { CashSessions } from './pages/tenant/CashSessions';
import { GeneralLedger } from './pages/tenant/GeneralLedger';
import { Timesheets } from './pages/tenant/Timesheets';
import { SalaryAdvances } from './pages/tenant/SalaryAdvances';
import { Payslips } from './pages/tenant/Payslips';
import { Prospects } from './pages/tenant/Prospects';
import { Followups } from './pages/tenant/Followups';
import { WarrantyClaims } from './pages/tenant/WarrantyClaims';
import { SupplierClaims } from './pages/tenant/SupplierClaims';

function RequireRole({ role }: {role: Role;}) {
  const { user, bootstrapping } = useAuth();
  if (bootstrapping) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={user.role === 'super' ? '/admin' : '/app'} replace />;
  return <Outlet />;
}

function SuperLayout() {
  return <DashboardLayout navGroups={SUPER_NAV} />;
}

/**
 * Applies a tenant's chosen brand palette (color) as CSS custom properties
 * on <html> — imperatively, not via an inline-style wrapper div. A wrapper
 * div's inherited CSS variables would never reach Modal.tsx's popups, since
 * those render through createPortal straight to document.body: portals
 * escape the DOM position of their React parent, so anything relying on
 * DOM-tree variable inheritance from a wrapper never reaches them. Setting
 * on <html> instead makes the variables visible to portaled content too,
 * since document.body is always a descendant of <html> regardless of where
 * a component sits in the React tree. Cleaned up on unmount/palette change
 * so leaving the tenant portal (or switching tenants) doesn't leak colors
 * into /admin or a different tenant's session.
 *
 * Also applies the tenant's default light/dark mode exactly once per tenant
 * user (not on every visit): ThemeProvider's own effect always writes
 * *something* to localStorage on mount before this component's
 * auth-dependent effect can run, so "only if nothing was ever stored" isn't
 * a reliable check here — instead a dedicated marker key records which user
 * id has already had their tenant default applied, so it fires once and
 * never overrides a tenant's own later manual toggle.
 */
function TenantThemeScope({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { setTheme } = useTheme();
  const palette = resolveBrandPalette(user?.branding);

  useEffect(() => {
    const root = document.documentElement;
    const vars = paletteCssVars(palette) as Record<string, string>;
    for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
    return () => {
      for (const key of Object.keys(vars)) root.style.removeProperty(key);
    };
  }, [palette]);

  useEffect(() => {
    if (!user?.id || !user.branding?.defaultMode) return;
    const seededKey = 'griptor-theme-seeded-for';
    if (localStorage.getItem(seededKey) === user.id) return;
    setTheme(user.branding.defaultMode);
    localStorage.setItem(seededKey, user.id);
  }, [user?.id, user?.branding?.defaultMode, setTheme]);

  useEffect(() => {
    const root = document.documentElement;
    const font = user?.branding?.fontFamily;
    if (!font) return;
    root.style.setProperty('--brand-font', `'${font}', ui-sans-serif, system-ui, sans-serif`);
    return () => {
      root.style.removeProperty('--brand-font');
    };
  }, [user?.branding?.fontFamily]);

  return <>{children}</>;
}

/** The hub/launcher at /app — shows a tile per active module (TenantDashboard.tsx), not a merged sidebar. */
function TenantHubLayout() {
  return (
    <TenantThemeScope>
      <DashboardLayout navGroups={HUB_NAV} footerSlot={<UpgradeCard />} />
    </TenantThemeScope>
  );
}

/** A single module's scoped dashboard (/app/:moduleId/*) — its own sidebar, its own pages, nothing from any other module. */
function ModuleLayout() {
  const { user } = useAuth();
  const { moduleId } = useParams();
  const mod = moduleId ? MODULE_BY_ID[moduleId] : undefined;
  const activeModules = user?.modules ?? [];

  if (!mod || !moduleId || !activeModules.includes(moduleId)) {
    return <Navigate to="/app" replace />;
  }

  return (
    <TenantThemeScope>
      <DashboardLayout navGroups={buildModuleNav(mod)} footerSlot={<UpgradeCard />} />
    </TenantThemeScope>
  );
}

/** /app/:moduleId with no sub-page — send them to the module's first page instead of a blank screen. */
function ModuleIndexRedirect() {
  const { moduleId } = useParams();
  const mod = moduleId ? MODULE_BY_ID[moduleId] : undefined;
  const firstSlug = mod?.navGroup?.items[0]?.to;
  if (!moduleId || !firstSlug) return <Navigate to="/app" replace />;
  return <Navigate to={`/app/${moduleId}/${firstSlug}`} replace />;
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/login/:slug" element={<Login />} />
            <Route path="/approve/:token" element={<PublicInspectionApproval />} />
            <Route path="/book/:slug" element={<PublicBooking />} />
            <Route path="/pay/thank-you" element={<PublicPaymentThankYou />} />
            <Route path="/pay/checkout/:token" element={<PublicPayStart />} />

            <Route element={<CustomerPortalProvider><Outlet /></CustomerPortalProvider>}>
              <Route path="/portal/:slug/login" element={<PortalLogin />} />
              <Route path="/portal/:slug/register" element={<PortalRegister />} />
              <Route path="/portal/:slug" element={<PortalDashboard />} />
            </Route>

            <Route element={<RequireRole role="super" />}>
              <Route path="/admin" element={<SuperLayout />}>
                <Route index element={<SuperDashboard />} />
                <Route path="clients" element={<Clients />} />
                <Route path="clients/:id" element={<ClientDetail />} />
                <Route path="subscriptions" element={<Subscriptions />} />
                <Route path="modules" element={<ModulesPricing />} />
                <Route path="leads" element={<Leads />} />
                <Route path="billing" element={<Billing />} />
                <Route path="tickets" element={<SupportTickets />} />
                <Route path="users" element={<Users />} />
                <Route path="settings" element={<SuperSettings />} />
              </Route>
            </Route>

            <Route element={<RequireRole role="tenant" />}>
              <Route path="/app" element={<TenantHubLayout />}>
                <Route index element={<TenantDashboard />} />
                <Route path="settings" element={<Settings />} />
              </Route>
              <Route path="/app/:moduleId" element={<ModuleLayout />}>
                <Route index element={<ModuleIndexRedirect />} />
                <Route path="jobs" element={<JobCards />} />
                <Route path="technicians" element={<Technicians />} />
                <Route path="inspections" element={<Inspections />} />
                <Route path="inspection-report" element={<InspectionReport />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="checkout" element={<POS />} />
                <Route path="suppliers" element={<Suppliers />} />
                <Route path="inventory-report" element={<InventoryReport />} />
                <Route path="customers" element={<Customers />} />
                <Route path="corporate-accounts" element={<CorporateAccounts />} />
                <Route path="job-report" element={<JobReport />} />
                <Route path="reminders" element={<Reminders />} />
                <Route path="feedback" element={<Feedback />} />
                <Route path="bookings" element={<Bookings />} />
                <Route path="services" element={<BookingServices />} />
                <Route path="booking-report" element={<BookingReport />} />
                <Route path="bays" element={<Workshop />} />
                <Route path="workshop-report" element={<WorkshopReport />} />
                <Route path="quotations" element={<Quotations />} />
                <Route path="invoices" element={<CustomerInvoices />} />
                <Route path="accounting-report" element={<AccountingReport />} />
                <Route path="reports" element={<Reports />} />
                <Route path="call-logs" element={<CallLogs />} />
                <Route path="rewards" element={<Rewards />} />
                <Route path="approvals" element={<Approvals />} />
                <Route path="messaging" element={<Messaging />} />
                <Route path="customer-report" element={<CustomerReport />} />
                <Route path="branches" element={<Branches />} />
                <Route path="staff" element={<Staff />} />
                <Route path="roles" element={<RolesPermissions />} />
                <Route path="settings" element={<Settings />} />
                <Route path="purchase-orders" element={<PurchaseOrders />} />
                <Route path="bank-accounts" element={<BankAccounts />} />
                <Route path="transactions" element={<Transactions />} />
                <Route path="returns" element={<Returns />} />
                <Route path="complaints" element={<Complaints />} />
                <Route path="financial-overview" element={<FinancialOverview />} />
                <Route path="expenses" element={<Expenses />} />
                <Route path="payroll" element={<Payroll />} />
                <Route path="sales" element={<Sales />} />
                <Route path="employees" element={<Employees />} />
                <Route path="leave-requests" element={<LeaveRequests />} />
                <Route path="attendance" element={<Attendance />} />
                <Route path="job-openings" element={<Recruitment />} />
                <Route path="performance-reviews" element={<PerformanceReviews />} />
                <Route path="hr-report" element={<HrReport />} />
                <Route path="purchase-report" element={<PurchaseReport />} />
                <Route path="supplier-report" element={<SupplierReport />} />
                <Route path="ar-aging" element={<ArAging />} />
                <Route path="ap-aging" element={<ApAging />} />
                <Route path="departments" element={<Departments />} />
                <Route path="warehouses" element={<Warehouses />} />
                <Route path="stock-transfers" element={<StockTransfers />} />
                <Route path="stock-adjustments" element={<StockAdjustments />} />
                <Route path="stock-counts" element={<StockCounts />} />
                <Route path="purchase-requisitions" element={<PurchaseRequisitions />} />
                <Route path="rfqs" element={<RFQs />} />
                <Route path="goods-received-notes" element={<GoodsReceivedNotes />} />
                <Route path="purchase-invoices" element={<PurchaseInvoices />} />
                <Route path="sales-orders" element={<SalesOrders />} />
                <Route path="delivery-notes" element={<DeliveryNotes />} />
                <Route path="chart-of-accounts" element={<ChartOfAccounts />} />
                <Route path="cash-sessions" element={<CashSessions />} />
                <Route path="general-ledger" element={<GeneralLedger />} />
                <Route path="timesheets" element={<Timesheets />} />
                <Route path="salary-advances" element={<SalaryAdvances />} />
                <Route path="payslips" element={<Payslips />} />
                <Route path="prospects" element={<Prospects />} />
                <Route path="followups" element={<Followups />} />
                <Route path="warranty-claims" element={<WarrantyClaims />} />
                <Route path="supplier-claims" element={<SupplierClaims />} />
              </Route>
            </Route>

            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
          <Toaster position="top-right" richColors closeButton />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>);

}