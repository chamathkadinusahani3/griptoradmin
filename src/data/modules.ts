

export interface AddOn {
  id: string;
  name: string;
  price: number;
}

export interface NavItemDef {
  label: string;
  /** page slug, relative to /app/:moduleId/ — NOT an absolute path, since the same page can be reached via more than one module (e.g. 'inspections' under both gms and vehicle-inspection) */
  to: string;
  /** lucide-react icon export name, resolved to a component in navConfig.ts */
  icon: string;
}

export interface ModuleDef {
  id: string;
  name: string;
  price: number;
  tagline: string;
  core: string[];
  addOns: AddOn[];
  /** sidebar nav this module unlocks for tenants — modules that unlock nothing new (e.g. Cloud Hosting) omit this */
  navGroup?: { heading: string; items: NavItemDef[] };
}

export const MODULES: ModuleDef[] = [
{
  id: 'gms',
  name: 'Garage Management System',
  price: 79,
  tagline: 'Job cards, technicians & digital inspections',
  core: ['Job Cards & Estimates', 'Technician Tracking', 'Digital Inspections'],
  addOns: [
  { id: 'gms-multi', name: 'Multi-location Support', price: 29 },
  { id: 'gms-fleet', name: 'Fleet Management', price: 39 },
  { id: 'gms-brand', name: 'Custom Branding', price: 19 }],

  navGroup: {
    heading: 'Garage Management',
    items: [
    { label: 'Job Cards', to: 'jobs', icon: 'ClipboardListIcon' },
    { label: 'Technicians', to: 'technicians', icon: 'WrenchIcon' },
    { label: 'Digital Inspections', to: 'inspections', icon: 'CameraIcon' },
    { label: 'Branches', to: 'branches', icon: 'MapPinIcon' },
    { label: 'Staff', to: 'staff', icon: 'UsersIcon' },
    { label: 'Corporate Accounts', to: 'corporate-accounts', icon: 'BuildingIcon' },
    { label: 'Settings', to: 'settings', icon: 'SettingsIcon' }]

  }
},
{
  id: 'pos',
  name: 'Inventory & POS',
  price: 59,
  tagline: 'Parts inventory, barcode & point of sale',
  core: ['Barcode Scanning', 'Low Stock Alerts', 'Supplier Management'],
  addOns: [
  { id: 'pos-warehouse', name: 'Multi-warehouse Sync', price: 25 },
  { id: 'pos-forecast', name: 'Demand Forecasting', price: 35 },
  { id: 'pos-hardware', name: 'Hardware Integration Kit', price: 15 }],

  navGroup: {
    heading: 'Inventory & POS',
    items: [
    { label: 'Inventory', to: 'inventory', icon: 'BoxesIcon' },
    { label: 'Point of Sale', to: 'checkout', icon: 'ScanBarcodeIcon' },
    { label: 'Suppliers', to: 'suppliers', icon: 'TruckIcon' }]

  }
},
{
  id: 'crm',
  name: 'Customer CRM',
  price: 49,
  tagline: 'Reminders, WhatsApp & customer feedback',
  core: ['Service Reminders', 'WhatsApp Integration', 'Feedback System'],
  addOns: [
  { id: 'crm-loyalty', name: 'Loyalty & Rewards', price: 20 },
  { id: 'crm-marketing', name: 'Marketing Automation', price: 30 },
  { id: 'crm-app', name: 'Customer Mobile App', price: 25 }],

  navGroup: {
    heading: 'Customer CRM',
    items: [
    { label: 'Customers', to: 'customers', icon: 'UsersIcon' },
    { label: 'Corporate Accounts', to: 'corporate-accounts', icon: 'BuildingIcon' },
    { label: 'Reminders', to: 'reminders', icon: 'BellRingIcon' },
    { label: 'Feedback', to: 'feedback', icon: 'StarIcon' },
    { label: 'Call Logs', to: 'call-logs', icon: 'PhoneIcon' },
    { label: 'Rewards', to: 'rewards', icon: 'GiftIcon' },
    { label: 'Approvals', to: 'approvals', icon: 'ClipboardCheckIcon' },
    { label: 'Messaging', to: 'messaging', icon: 'MessageSquareIcon' }]

  }
},
{
  id: 'vehicle-inspection',
  name: 'Vehicle Inspection',
  price: 25,
  tagline: 'Digital multi-point inspection forms with photo uploads',
  core: ['Digital Inspections'],
  addOns: [],
  navGroup: {
    heading: 'Vehicle Inspection',
    items: [{ label: 'Digital Inspections', to: 'inspections', icon: 'CameraIcon' }]
  }
},
{
  id: 'booking-system',
  name: 'Booking System',
  price: 35,
  tagline: 'Online appointment scheduling with a shareable public link',
  core: ['Public Booking Page', 'Real-Time Availability', 'Service Catalog'],
  addOns: [],
  navGroup: {
    heading: 'Booking System',
    items: [
    { label: 'Bookings', to: 'bookings', icon: 'CalendarIcon' },
    { label: 'Services', to: 'services', icon: 'ListChecksIcon' }]

  }
},
{
  id: 'workshop-management',
  name: 'Workshop Management',
  price: 45,
  tagline: 'Optimize bay utilization and technician scheduling',
  core: ['Bay Availability Board', 'Technician Attendance', 'Job-to-Bay Assignment'],
  addOns: [],
  navGroup: {
    heading: 'Workshop Management',
    items: [
    { label: 'Bays', to: 'bays', icon: 'LayoutGridIcon' },
    { label: 'Technicians', to: 'technicians', icon: 'WrenchIcon' }]

  }
},
{
  id: 'accounting',
  name: 'Accounting',
  price: 49,
  tagline: 'Integrated financial tracking, invoicing, and tax reporting',
  core: ['Quotations', 'Invoicing', 'Payment Tracking'],
  addOns: [],
  navGroup: {
    heading: 'Accounting',
    items: [
    { label: 'Quotations', to: 'quotations', icon: 'FileTextIcon' },
    { label: 'Invoices', to: 'invoices', icon: 'ReceiptIcon' }]

  }
},
{
  id: 'reports-analytics',
  name: 'Reports & Analytics',
  price: 39,
  tagline: 'Deep insights into revenue, performance, and growth',
  core: ['Revenue Trends', 'Job & Technician Performance', 'Inventory Analytics'],
  addOns: [],
  navGroup: {
    heading: 'Reports & Analytics',
    items: [{ label: 'Reports', to: 'reports', icon: 'BarChart3Icon' }]
  }
}];


export const MODULE_BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m])) as Record<string, ModuleDef>;

export interface PricingTier {
  id: string;
  name: string;
  price: number | null; // null = custom
  cadence: string;
  popular?: boolean;
  description: string;
  features: string[];
}

export const PRICING_TIERS: PricingTier[] = [
{
  id: 'starter',
  name: 'Starter',
  price: 99,
  cadence: '/mo',
  description: 'For single-bay garages getting started.',
  features: ['1 module included', 'Up to 3 staff seats', 'Email support', 'Basic reporting', '1 location']
},
{
  id: 'pro',
  name: 'Professional',
  price: 249,
  cadence: '/mo',
  popular: true,
  description: 'For growing multi-bay workshops.',
  features: [
  'All modules included',
  'Up to 15 staff seats',
  'Priority support',
  'Advanced analytics',
  'Up to 3 locations',
  'API access']

},
{
  id: 'enterprise',
  name: 'Enterprise',
  price: null,
  cadence: 'Custom',
  description: 'For garage chains & franchises.',
  features: [
  'All modules + add-ons',
  'Unlimited seats',
  'Dedicated success manager',
  'Custom integrations',
  'Unlimited locations',
  'SLA & SSO']

}];