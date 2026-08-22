




import {
  LayoutDashboardIcon,
  LayoutGridIcon,
  BuildingIcon,
  CreditCardIcon,
  PackageIcon,
  InboxIcon,
  ReceiptIcon,
  LifeBuoyIcon,
  SettingsIcon,
  ClipboardListIcon,
  WrenchIcon,
  CameraIcon,
  BoxesIcon,
  ScanBarcodeIcon,
  TruckIcon,
  UsersIcon,
  BellRingIcon,
  StarIcon,
  CalendarIcon,
  ListChecksIcon,
  FileTextIcon,
  BarChart3Icon,
  GiftIcon,
  PhoneIcon,
  ClipboardCheckIcon,
  MessageSquareIcon,
  MapPinIcon,
  ShoppingCartIcon,
  WalletIcon,
  BanknoteIcon,
  CalendarClockIcon,
  ClockIcon,
  BriefcaseIcon,
  TrendingUpIcon,
  ShieldIcon,
  LandmarkIcon,
  ArrowLeftRightIcon,
  RotateCcwIcon,
  AlertTriangleIcon,
  WarehouseIcon,
  SlidersHorizontalIcon,
  SendIcon,
  PackageCheckIcon,
  LibraryIcon,
  BookOpenIcon,
  UserPlusIcon,
  ShieldCheckIcon,
  FileWarningIcon,
  LucideIcon } from
'lucide-react';
import { ModuleDef } from '../../data/modules';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

/** A collapsible main-topic group within a nav list (e.g. "Sales", "Purchase"), holding its own flat list of sub-items. */
export interface NavSection {
  label: string;
  items: NavItem[];
}

export interface NavGroup {
  heading?: string;
  /** Flat single-level list — most modules. Mutually exclusive with `sections`. */
  items?: NavItem[];
  /** Two-level list of collapsible main-topic groups — used by modules with enough pages to need grouping (currently only ERP). Mutually exclusive with `items`. */
  sections?: NavSection[];
}

/** Maps the icon-name strings stored in ModuleDef.navGroup to actual components. */
const ICONS: Record<string, LucideIcon> = {
  ClipboardListIcon,
  WrenchIcon,
  CameraIcon,
  BoxesIcon,
  ScanBarcodeIcon,
  TruckIcon,
  UsersIcon,
  BellRingIcon,
  StarIcon,
  CalendarIcon,
  ListChecksIcon,
  LayoutGridIcon,
  FileTextIcon,
  ReceiptIcon,
  BarChart3Icon,
  GiftIcon,
  PhoneIcon,
  ClipboardCheckIcon,
  MessageSquareIcon,
  MapPinIcon,
  BuildingIcon,
  SettingsIcon,
  ShoppingCartIcon,
  WalletIcon,
  BanknoteIcon,
  CalendarClockIcon,
  ClockIcon,
  BriefcaseIcon,
  TrendingUpIcon,
  ShieldIcon,
  LandmarkIcon,
  ArrowLeftRightIcon,
  RotateCcwIcon,
  AlertTriangleIcon,
  WarehouseIcon,
  SlidersHorizontalIcon,
  SendIcon,
  PackageCheckIcon,
  LibraryIcon,
  BookOpenIcon,
  UserPlusIcon,
  ShieldCheckIcon,
  FileWarningIcon
};

export const SUPER_NAV: NavGroup[] = [
{
  items: [
  { label: 'Dashboard', to: '/admin', icon: LayoutDashboardIcon },
  { label: 'Clients', to: '/admin/clients', icon: BuildingIcon },
  { label: 'Subscriptions', to: '/admin/subscriptions', icon: CreditCardIcon },
  { label: 'Modules & Pricing', to: '/admin/modules', icon: PackageIcon },
  { label: 'Leads', to: '/admin/leads', icon: InboxIcon },
  { label: 'Billing', to: '/admin/billing', icon: ReceiptIcon },
  { label: 'Support Tickets', to: '/admin/tickets', icon: LifeBuoyIcon },
  { label: 'Users', to: '/admin/users', icon: UsersIcon },
  { label: 'Settings', to: '/admin/settings', icon: SettingsIcon }]

}];

/** Minimal nav shown on the hub page (/app) itself — the hub is a launcher, not a scoped module dashboard, so it just shows a way back to itself. */
export const HUB_NAV: NavGroup[] = [
{ items: [
  { label: 'Dashboard', to: '/app', icon: LayoutDashboardIcon },
  { label: 'Settings', to: '/app/settings', icon: SettingsIcon }] }];


/**
 * Build the sidebar nav for ONE module's scoped dashboard (/app/:moduleId/*).
 * Each tenant page lives under its own module now, instead of every active
 * module's pages being merged into one shared sidebar — so this only ever
 * needs to resolve a single module's own navGroup, plus a link back to the
 * hub (/app) where all active modules are listed as tiles.
 */
export function buildModuleNav(mod: ModuleDef): NavGroup[] {
  const groups: NavGroup[] = [
  { items: [{ label: 'All Modules', to: '/app', icon: LayoutGridIcon }] }];

  if (mod.navGroup?.sections) {
    groups.push({
      heading: mod.navGroup.heading,
      sections: mod.navGroup.sections.map((section) => ({
        label: section.label,
        items: section.items.map((item) => ({
          label: item.label,
          to: `/app/${mod.id}/${item.to}`,
          icon: ICONS[item.icon] ?? LayoutDashboardIcon
        }))
      }))
    });
  } else if (mod.navGroup?.items) {
    groups.push({
      heading: mod.navGroup.heading,
      items: mod.navGroup.items.map((item) => ({
        label: item.label,
        to: `/app/${mod.id}/${item.to}`,
        icon: ICONS[item.icon] ?? LayoutDashboardIcon
      }))
    });
  }

  return groups;
}