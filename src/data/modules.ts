

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
    { label: 'Customers', to: 'customers', icon: 'UsersIcon' },
    { label: 'Technicians', to: 'technicians', icon: 'WrenchIcon' },
    { label: 'Digital Inspections', to: 'inspections', icon: 'CameraIcon' },
    { label: 'Branches', to: 'branches', icon: 'MapPinIcon' },
    { label: 'Staff', to: 'staff', icon: 'UsersIcon' },
    { label: 'Roles & Permissions', to: 'roles', icon: 'ShieldIcon' },
    { label: 'Corporate Accounts', to: 'corporate-accounts', icon: 'BuildingIcon' },
    { label: 'Job Report', to: 'job-report', icon: 'BarChart3Icon' },
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
    { label: 'Warehouses', to: 'warehouses', icon: 'WarehouseIcon' },
    { label: 'Stock Transfers', to: 'stock-transfers', icon: 'ArrowLeftRightIcon' },
    { label: 'Stock Adjustments', to: 'stock-adjustments', icon: 'SlidersHorizontalIcon' },
    { label: 'Stock Counts', to: 'stock-counts', icon: 'ClipboardListIcon' },
    { label: 'Point of Sale', to: 'checkout', icon: 'ScanBarcodeIcon' },
    { label: 'Sales', to: 'sales', icon: 'ReceiptIcon' },
    { label: 'Sales Orders', to: 'sales-orders', icon: 'FileTextIcon' },
    { label: 'Delivery Notes', to: 'delivery-notes', icon: 'TruckIcon' },
    { label: 'Suppliers', to: 'suppliers', icon: 'TruckIcon' },
    { label: 'Purchase Orders', to: 'purchase-orders', icon: 'ShoppingCartIcon' },
    { label: 'Returns', to: 'returns', icon: 'RotateCcwIcon' },
    { label: 'Inventory Report', to: 'inventory-report', icon: 'BarChart3Icon' }]

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
    { label: 'Prospects', to: 'prospects', icon: 'UserPlusIcon' },
    { label: 'Corporate Accounts', to: 'corporate-accounts', icon: 'BuildingIcon' },
    { label: 'Suppliers', to: 'suppliers', icon: 'TruckIcon' },
    { label: 'Reminders', to: 'reminders', icon: 'BellRingIcon' },
    { label: 'Follow-ups', to: 'followups', icon: 'CalendarClockIcon' },
    { label: 'Feedback', to: 'feedback', icon: 'StarIcon' },
    { label: 'Call Logs', to: 'call-logs', icon: 'PhoneIcon' },
    { label: 'Rewards', to: 'rewards', icon: 'GiftIcon' },
    { label: 'Approvals', to: 'approvals', icon: 'ClipboardCheckIcon' },
    { label: 'Messaging', to: 'messaging', icon: 'MessageSquareIcon' },
    { label: 'Complaints', to: 'complaints', icon: 'AlertTriangleIcon' },
    { label: 'Warranty Claims', to: 'warranty-claims', icon: 'ShieldCheckIcon' },
    { label: 'Customer Report', to: 'customer-report', icon: 'BarChart3Icon' }]

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
    items: [
    { label: 'Customers', to: 'customers', icon: 'UsersIcon' },
    { label: 'Technicians', to: 'technicians', icon: 'WrenchIcon' },
    { label: 'Digital Inspections', to: 'inspections', icon: 'CameraIcon' },
    { label: 'Inspection Report', to: 'inspection-report', icon: 'BarChart3Icon' }]

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
    { label: 'Services', to: 'services', icon: 'ListChecksIcon' },
    { label: 'Booking Report', to: 'booking-report', icon: 'BarChart3Icon' }]

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
    { label: 'Technicians', to: 'technicians', icon: 'WrenchIcon' },
    { label: 'Workshop Report', to: 'workshop-report', icon: 'BarChart3Icon' }]

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
    { label: 'Customers', to: 'customers', icon: 'UsersIcon' },
    { label: 'Quotations', to: 'quotations', icon: 'FileTextIcon' },
    { label: 'Invoices', to: 'invoices', icon: 'ReceiptIcon' },
    { label: 'Accounting Report', to: 'accounting-report', icon: 'BarChart3Icon' }]

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
    items: [
    { label: 'Reports', to: 'reports', icon: 'BarChart3Icon' },
    { label: 'Financial Overview', to: 'financial-overview', icon: 'TrendingUpIcon' },
    { label: 'Transactions', to: 'transactions', icon: 'ArrowLeftRightIcon' }]

  }
},
{
  id: 'erp',
  name: 'ERP',
  price: 39,
  tagline: 'Purchase orders, inventory & core accounting',
  core: ['Purchase Orders & GRN', 'Inventory & Stock Control', 'Expense Tracking', 'Chart of Accounts & General Ledger'],
  addOns: [],
  navGroup: {
    heading: 'ERP',
    items: [
    { label: 'Inventory', to: 'inventory', icon: 'BoxesIcon' },
    { label: 'Warehouses', to: 'warehouses', icon: 'WarehouseIcon' },
    { label: 'Stock Transfers', to: 'stock-transfers', icon: 'ArrowLeftRightIcon' },
    { label: 'Stock Adjustments', to: 'stock-adjustments', icon: 'SlidersHorizontalIcon' },
    { label: 'Stock Counts', to: 'stock-counts', icon: 'ClipboardListIcon' },
    { label: 'Suppliers', to: 'suppliers', icon: 'TruckIcon' },
    { label: 'Customers', to: 'customers', icon: 'UsersIcon' },
    { label: 'Technicians', to: 'technicians', icon: 'WrenchIcon' },
    { label: 'Purchase Requisitions', to: 'purchase-requisitions', icon: 'ClipboardCheckIcon' },
    { label: 'Purchase Orders', to: 'purchase-orders', icon: 'ShoppingCartIcon' },
    { label: 'Goods Received', to: 'goods-received-notes', icon: 'PackageCheckIcon' },
    { label: 'Purchase Invoices', to: 'purchase-invoices', icon: 'ReceiptIcon' },
    { label: 'Sales', to: 'sales', icon: 'ReceiptIcon' },
    { label: 'Sales Orders', to: 'sales-orders', icon: 'FileTextIcon' },
    { label: 'Delivery Notes', to: 'delivery-notes', icon: 'TruckIcon' },
    { label: 'Expenses', to: 'expenses', icon: 'WalletIcon' },
    { label: 'Chart of Accounts', to: 'chart-of-accounts', icon: 'LibraryIcon' },
    { label: 'General Ledger', to: 'general-ledger', icon: 'BookOpenIcon' },
    { label: 'Cash Sessions', to: 'cash-sessions', icon: 'WalletIcon' },
    { label: 'Bank Accounts', to: 'bank-accounts', icon: 'LandmarkIcon' },
    { label: 'Transactions', to: 'transactions', icon: 'ArrowLeftRightIcon' },
    { label: 'Returns', to: 'returns', icon: 'RotateCcwIcon' },
    { label: 'Complaints', to: 'complaints', icon: 'AlertTriangleIcon' },
    { label: 'Inventory Report', to: 'inventory-report', icon: 'BarChart3Icon' },
    { label: 'Purchase Report', to: 'purchase-report', icon: 'BarChart3Icon' },
    { label: 'Supplier Report', to: 'supplier-report', icon: 'BarChart3Icon' },
    { label: 'AR Aging', to: 'ar-aging', icon: 'ClockIcon' },
    { label: 'AP Aging', to: 'ap-aging', icon: 'ClockIcon' }]

  }
},
{
  id: 'erp-plus',
  name: 'ERP+',
  price: 69,
  tagline: 'Everything in ERP, plus procurement workflow, payroll & claims tracking',
  core: ['Everything in ERP', 'Purchase Requisitions → RFQ workflow', 'Payroll, Salary Advances & Payslips', 'Warranty & Supplier Claims'],
  addOns: [],
  navGroup: {
    heading: 'ERP+',
    items: [
    { label: 'Inventory', to: 'inventory', icon: 'BoxesIcon' },
    { label: 'Warehouses', to: 'warehouses', icon: 'WarehouseIcon' },
    { label: 'Stock Transfers', to: 'stock-transfers', icon: 'ArrowLeftRightIcon' },
    { label: 'Stock Adjustments', to: 'stock-adjustments', icon: 'SlidersHorizontalIcon' },
    { label: 'Stock Counts', to: 'stock-counts', icon: 'ClipboardListIcon' },
    { label: 'Suppliers', to: 'suppliers', icon: 'TruckIcon' },
    { label: 'Customers', to: 'customers', icon: 'UsersIcon' },
    { label: 'Technicians', to: 'technicians', icon: 'WrenchIcon' },
    { label: 'Purchase Requisitions', to: 'purchase-requisitions', icon: 'ClipboardCheckIcon' },
    { label: 'RFQs', to: 'rfqs', icon: 'SendIcon' },
    { label: 'Purchase Orders', to: 'purchase-orders', icon: 'ShoppingCartIcon' },
    { label: 'Goods Received', to: 'goods-received-notes', icon: 'PackageCheckIcon' },
    { label: 'Purchase Invoices', to: 'purchase-invoices', icon: 'ReceiptIcon' },
    { label: 'Sales', to: 'sales', icon: 'ReceiptIcon' },
    { label: 'Sales Orders', to: 'sales-orders', icon: 'FileTextIcon' },
    { label: 'Delivery Notes', to: 'delivery-notes', icon: 'TruckIcon' },
    { label: 'Expenses', to: 'expenses', icon: 'WalletIcon' },
    { label: 'Chart of Accounts', to: 'chart-of-accounts', icon: 'LibraryIcon' },
    { label: 'General Ledger', to: 'general-ledger', icon: 'BookOpenIcon' },
    { label: 'Cash Sessions', to: 'cash-sessions', icon: 'WalletIcon' },
    { label: 'Payroll', to: 'payroll', icon: 'BanknoteIcon' },
    { label: 'Salary Advances', to: 'salary-advances', icon: 'BanknoteIcon' },
    { label: 'Payslips', to: 'payslips', icon: 'FileTextIcon' },
    { label: 'Bank Accounts', to: 'bank-accounts', icon: 'LandmarkIcon' },
    { label: 'Departments', to: 'departments', icon: 'BuildingIcon' },
    { label: 'Transactions', to: 'transactions', icon: 'ArrowLeftRightIcon' },
    { label: 'Returns', to: 'returns', icon: 'RotateCcwIcon' },
    { label: 'Complaints', to: 'complaints', icon: 'AlertTriangleIcon' },
    { label: 'Warranty Claims', to: 'warranty-claims', icon: 'ShieldCheckIcon' },
    { label: 'Supplier Claims', to: 'supplier-claims', icon: 'FileWarningIcon' },
    { label: 'Inventory Report', to: 'inventory-report', icon: 'BarChart3Icon' },
    { label: 'Purchase Report', to: 'purchase-report', icon: 'BarChart3Icon' },
    { label: 'Supplier Report', to: 'supplier-report', icon: 'BarChart3Icon' },
    { label: 'AR Aging', to: 'ar-aging', icon: 'ClockIcon' },
    { label: 'AP Aging', to: 'ap-aging', icon: 'ClockIcon' }]

  }
},
{
  id: 'erp-pro',
  name: 'ERP Pro',
  price: 109,
  tagline: 'The full ERP+ feature set, with priority access as advanced Finance & multi-branch tools ship',
  core: ['Everything in ERP+', 'Priority access to Fixed Assets, Multi-Company & Bank Reconciliation as they ship', 'Priority support'],
  addOns: [],
  navGroup: {
    heading: 'ERP Pro',
    items: [
    { label: 'Inventory', to: 'inventory', icon: 'BoxesIcon' },
    { label: 'Warehouses', to: 'warehouses', icon: 'WarehouseIcon' },
    { label: 'Stock Transfers', to: 'stock-transfers', icon: 'ArrowLeftRightIcon' },
    { label: 'Stock Adjustments', to: 'stock-adjustments', icon: 'SlidersHorizontalIcon' },
    { label: 'Stock Counts', to: 'stock-counts', icon: 'ClipboardListIcon' },
    { label: 'Suppliers', to: 'suppliers', icon: 'TruckIcon' },
    { label: 'Customers', to: 'customers', icon: 'UsersIcon' },
    { label: 'Technicians', to: 'technicians', icon: 'WrenchIcon' },
    { label: 'Purchase Requisitions', to: 'purchase-requisitions', icon: 'ClipboardCheckIcon' },
    { label: 'RFQs', to: 'rfqs', icon: 'SendIcon' },
    { label: 'Purchase Orders', to: 'purchase-orders', icon: 'ShoppingCartIcon' },
    { label: 'Goods Received', to: 'goods-received-notes', icon: 'PackageCheckIcon' },
    { label: 'Purchase Invoices', to: 'purchase-invoices', icon: 'ReceiptIcon' },
    { label: 'Sales', to: 'sales', icon: 'ReceiptIcon' },
    { label: 'Sales Orders', to: 'sales-orders', icon: 'FileTextIcon' },
    { label: 'Delivery Notes', to: 'delivery-notes', icon: 'TruckIcon' },
    { label: 'Expenses', to: 'expenses', icon: 'WalletIcon' },
    { label: 'Chart of Accounts', to: 'chart-of-accounts', icon: 'LibraryIcon' },
    { label: 'General Ledger', to: 'general-ledger', icon: 'BookOpenIcon' },
    { label: 'Cash Sessions', to: 'cash-sessions', icon: 'WalletIcon' },
    { label: 'Payroll', to: 'payroll', icon: 'BanknoteIcon' },
    { label: 'Salary Advances', to: 'salary-advances', icon: 'BanknoteIcon' },
    { label: 'Payslips', to: 'payslips', icon: 'FileTextIcon' },
    { label: 'Bank Accounts', to: 'bank-accounts', icon: 'LandmarkIcon' },
    { label: 'Departments', to: 'departments', icon: 'BuildingIcon' },
    { label: 'Transactions', to: 'transactions', icon: 'ArrowLeftRightIcon' },
    { label: 'Returns', to: 'returns', icon: 'RotateCcwIcon' },
    { label: 'Complaints', to: 'complaints', icon: 'AlertTriangleIcon' },
    { label: 'Warranty Claims', to: 'warranty-claims', icon: 'ShieldCheckIcon' },
    { label: 'Supplier Claims', to: 'supplier-claims', icon: 'FileWarningIcon' },
    { label: 'Inventory Report', to: 'inventory-report', icon: 'BarChart3Icon' },
    { label: 'Purchase Report', to: 'purchase-report', icon: 'BarChart3Icon' },
    { label: 'Supplier Report', to: 'supplier-report', icon: 'BarChart3Icon' },
    { label: 'AR Aging', to: 'ar-aging', icon: 'ClockIcon' },
    { label: 'AP Aging', to: 'ap-aging', icon: 'ClockIcon' }]

  }
},
{
  id: 'hrm',
  name: 'HRM',
  price: 55,
  tagline: 'Employee records, attendance, leave, recruitment & performance',
  core: ['Employee Records', 'Attendance', 'Leave Requests', 'Recruitment', 'Performance Reviews'],
  addOns: [],
  navGroup: {
    heading: 'HRM',
    items: [
    { label: 'Employees', to: 'employees', icon: 'UsersIcon' },
    { label: 'Technicians', to: 'technicians', icon: 'WrenchIcon' },
    { label: 'Departments', to: 'departments', icon: 'BuildingIcon' },
    { label: 'Attendance', to: 'attendance', icon: 'ClockIcon' },
    { label: 'Timesheets', to: 'timesheets', icon: 'ClockIcon' },
    { label: 'Leave Requests', to: 'leave-requests', icon: 'CalendarClockIcon' },
    { label: 'Payroll', to: 'payroll', icon: 'BanknoteIcon' },
    { label: 'Salary Advances', to: 'salary-advances', icon: 'BanknoteIcon' },
    { label: 'Payslips', to: 'payslips', icon: 'FileTextIcon' },
    { label: 'Recruitment', to: 'job-openings', icon: 'BriefcaseIcon' },
    { label: 'Performance', to: 'performance-reviews', icon: 'TrendingUpIcon' },
    { label: 'HR Report', to: 'hr-report', icon: 'BarChart3Icon' }]

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