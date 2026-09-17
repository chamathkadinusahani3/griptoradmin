import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Client, ClientDoc } from '../../models/Client.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeClient } from '../../serializers.js';
import { hasAddOn } from '../../entitlements.js';

interface UpdateSettingsBody {
  name?: string;
  contact?: string;
  email?: string;
  branding?: {
    paletteId?: string;
    logoDataUrl?: string | null;
    defaultMode?: 'light' | 'dark';
    accentColor?: string | null;
    sidebarStyle?: 'expanded' | 'compact';
    fontFamily?: string;
  };
  address?: string;
  phone?: string;
  taxId?: string;
  website?: string;
  taxRatePct?: number;
  fiscalYearStartMonth?: number;
  numberingPrefixes?: {
    invoice?: string;
    quotation?: string;
    purchaseOrder?: string;
    complaint?: string;
    expense?: string;
    return?: string;
    purchaseRequisition?: string;
    rfq?: string;
    supplierQuotation?: string;
    grn?: string;
    purchaseInvoice?: string;
    salesOrder?: string;
    deliveryNote?: string;
    salaryAdvance?: string;
    warrantyClaim?: string;
    supplierClaim?: string;
    creditNote?: string;
    debitNote?: string;
    receipt?: string;
    advancePayment?: string;
    stockIssue?: string;
    cashHandover?: string;
    utilization?: string;
    customerDebitNote?: string;
    effectiveNote?: string;
  };
  deliveryLoadRules?: { maxVolume: number; vehicleType: string }[];
  fuelPricePerLiter?: number;
  requireSalesOrderApproval?: boolean;
  requireDeliveryConfirm?: boolean;
  customerCreditLimitPolicy?: 'Off' | 'Block' | 'Warn' | 'RequireApproval';
  returnRatioPolicy?: 'Off' | 'Block' | 'Warn' | 'RequireApproval';
  returnRatioThresholdPct?: number;
  priceListsEnabled?: boolean;
  maxDiscountPctBeforeApproval?: number;
  invoiceApprovalThresholdAmount?: number;
  requireReturnApproval?: boolean;
  requireRefundApproval?: boolean;
}

const CUSTOMER_CREDIT_LIMIT_POLICIES = ['Off', 'Block', 'Warn', 'RequireApproval'] as const;

const NUMBERING_KEYS = [
  'invoice',
  'quotation',
  'purchaseOrder',
  'complaint',
  'expense',
  'return',
  'purchaseRequisition',
  'rfq',
  'supplierQuotation',
  'grn',
  'purchaseInvoice',
  'salesOrder',
  'deliveryNote',
  'salaryAdvance',
  'warrantyClaim',
  'supplierClaim',
  'creditNote',
  'debitNote',
  'receipt',
  'advancePayment',
  'stockIssue',
  'cashHandover',
  'utilization',
  'customerDebitNote',
  'effectiveNote',
] as const;
// A document number is embedded in a URL-safe-ish reference string
// everywhere it's shown (invoice PDFs, PO printouts) — same conservative
// charset as generateUniqueSlug, just uppercased by convention.
const PREFIX_PATTERN = /^[A-Z0-9]{1,6}$/;

// Same server-side backstop as api/clients/[id].ts's MAX_LOGO_DATA_URL_LENGTH.
const MAX_LOGO_DATA_URL_LENGTH = 2_000_000;

// Self-service garage profile + branding — closes the gap flagged in
// api/tenant/sms-config.ts's own comment ("branding/other Client fields are
// still super-admin-edited"). Owner/Manager only (requireTenantPermission),
// scoped strictly to the caller's own session.clientId — never an :id param.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'settings:edit');
  if (!session) return;

  const {
    name, contact, email, branding, address, phone, taxId, website, taxRatePct, fiscalYearStartMonth, numberingPrefixes,
    deliveryLoadRules, fuelPricePerLiter, requireSalesOrderApproval, requireDeliveryConfirm, customerCreditLimitPolicy,
    returnRatioPolicy, returnRatioThresholdPct, priceListsEnabled,
    maxDiscountPctBeforeApproval, invoiceApprovalThresholdAmount, requireReturnApproval, requireRefundApproval,
  } = (req.body ?? {}) as UpdateSettingsBody;

  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ error: 'Garage name cannot be empty' });
  }
  if (contact !== undefined && !contact.trim()) {
    return res.status(400).json({ error: 'Contact name cannot be empty' });
  }
  if (email !== undefined && !email.trim()) {
    return res.status(400).json({ error: 'Email cannot be empty' });
  }
  if (branding?.logoDataUrl && branding.logoDataUrl.length > MAX_LOGO_DATA_URL_LENGTH) {
    return res.status(400).json({ error: 'Logo image is too large' });
  }
  if (taxRatePct !== undefined && (typeof taxRatePct !== 'number' || taxRatePct < 0 || taxRatePct > 100)) {
    return res.status(400).json({ error: 'Tax rate must be a number between 0 and 100' });
  }
  if (fiscalYearStartMonth !== undefined && (!Number.isInteger(fiscalYearStartMonth) || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12)) {
    return res.status(400).json({ error: 'Fiscal year start month must be between 1 and 12' });
  }
  if (numberingPrefixes !== undefined) {
    for (const key of NUMBERING_KEYS) {
      const value = numberingPrefixes[key];
      if (value !== undefined && value !== '' && !PREFIX_PATTERN.test(value)) {
        return res.status(400).json({ error: `Numbering prefix for ${key} must be 1-6 uppercase letters/digits` });
      }
    }
  }
  if (deliveryLoadRules !== undefined) {
    for (const rule of deliveryLoadRules) {
      if (typeof rule.maxVolume !== 'number' || rule.maxVolume <= 0 || !rule.vehicleType?.trim()) {
        return res.status(400).json({ error: 'Each delivery load rule needs a positive maxVolume and a vehicleType' });
      }
    }
  }
  if (fuelPricePerLiter !== undefined && (typeof fuelPricePerLiter !== 'number' || fuelPricePerLiter < 0)) {
    return res.status(400).json({ error: 'Fuel price must be a non-negative number' });
  }
  if (requireSalesOrderApproval !== undefined && typeof requireSalesOrderApproval !== 'boolean') {
    return res.status(400).json({ error: 'requireSalesOrderApproval must be a boolean' });
  }
  if (requireDeliveryConfirm !== undefined && typeof requireDeliveryConfirm !== 'boolean') {
    return res.status(400).json({ error: 'requireDeliveryConfirm must be a boolean' });
  }
  if (customerCreditLimitPolicy !== undefined && !CUSTOMER_CREDIT_LIMIT_POLICIES.includes(customerCreditLimitPolicy)) {
    return res.status(400).json({ error: `customerCreditLimitPolicy must be one of: ${CUSTOMER_CREDIT_LIMIT_POLICIES.join(', ')}` });
  }
  if (returnRatioPolicy !== undefined && !CUSTOMER_CREDIT_LIMIT_POLICIES.includes(returnRatioPolicy)) {
    return res.status(400).json({ error: `returnRatioPolicy must be one of: ${CUSTOMER_CREDIT_LIMIT_POLICIES.join(', ')}` });
  }
  if (returnRatioThresholdPct !== undefined && (typeof returnRatioThresholdPct !== 'number' || returnRatioThresholdPct < 0 || returnRatioThresholdPct > 100)) {
    return res.status(400).json({ error: 'returnRatioThresholdPct must be a number between 0 and 100' });
  }
  if (priceListsEnabled !== undefined && typeof priceListsEnabled !== 'boolean') {
    return res.status(400).json({ error: 'priceListsEnabled must be a boolean' });
  }
  if (maxDiscountPctBeforeApproval !== undefined && (typeof maxDiscountPctBeforeApproval !== 'number' || maxDiscountPctBeforeApproval < 0 || maxDiscountPctBeforeApproval > 100)) {
    return res.status(400).json({ error: 'maxDiscountPctBeforeApproval must be a number between 0 and 100' });
  }
  if (invoiceApprovalThresholdAmount !== undefined && (typeof invoiceApprovalThresholdAmount !== 'number' || invoiceApprovalThresholdAmount < 0)) {
    return res.status(400).json({ error: 'invoiceApprovalThresholdAmount must be a non-negative number' });
  }
  if (requireReturnApproval !== undefined && typeof requireReturnApproval !== 'boolean') {
    return res.status(400).json({ error: 'requireReturnApproval must be a boolean' });
  }
  if (requireRefundApproval !== undefined && typeof requireRefundApproval !== 'boolean') {
    return res.status(400).json({ error: 'requireRefundApproval must be a boolean' });
  }

  await connectToDatabase();
  if (branding !== undefined && !(await hasAddOn(session.clientId, 'gms-brand'))) {
    return res.status(400).json({ error: 'Custom Branding requires the Custom Branding add-on' });
  }
  const existing = (await Client.findById(session.clientId).lean()) as ClientDoc | null;
  if (!existing) return res.status(404).json({ error: 'Garage not found' });

  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name.trim();
  if (contact !== undefined) update.contact = contact.trim();
  if (email !== undefined) update.email = email.trim().toLowerCase();
  if (branding !== undefined) {
    update.branding = {
      paletteId: existing.branding?.paletteId ?? 'blue',
      logoDataUrl: existing.branding?.logoDataUrl,
      defaultMode: existing.branding?.defaultMode ?? 'light',
      accentColor: existing.branding?.accentColor,
      sidebarStyle: existing.branding?.sidebarStyle ?? 'expanded',
      fontFamily: existing.branding?.fontFamily ?? 'Inter',
      ...branding,
    };
  }
  if (address !== undefined) update.address = address.trim();
  if (phone !== undefined) update.phone = phone.trim();
  if (taxId !== undefined) update.taxId = taxId.trim();
  if (website !== undefined) update.website = website.trim();
  if (taxRatePct !== undefined) update.taxRatePct = taxRatePct;
  if (fiscalYearStartMonth !== undefined) update.fiscalYearStartMonth = fiscalYearStartMonth;
  if (numberingPrefixes !== undefined) {
    update.numberingPrefixes = {
      ...existing.numberingPrefixes,
      ...Object.fromEntries(NUMBERING_KEYS.map((key) => [key, numberingPrefixes[key]?.trim() || undefined])),
    };
  }
  if (deliveryLoadRules !== undefined) {
    update.deliveryLoadRules = deliveryLoadRules
      .map((r) => ({ maxVolume: r.maxVolume, vehicleType: r.vehicleType.trim() }))
      .sort((a, b) => a.maxVolume - b.maxVolume);
  }
  if (fuelPricePerLiter !== undefined) update.fuelPricePerLiter = fuelPricePerLiter;
  if (requireSalesOrderApproval !== undefined) update.requireSalesOrderApproval = requireSalesOrderApproval;
  if (requireDeliveryConfirm !== undefined) update.requireDeliveryConfirm = requireDeliveryConfirm;
  if (customerCreditLimitPolicy !== undefined) update.customerCreditLimitPolicy = customerCreditLimitPolicy;
  if (returnRatioPolicy !== undefined) update.returnRatioPolicy = returnRatioPolicy;
  if (returnRatioThresholdPct !== undefined) update.returnRatioThresholdPct = returnRatioThresholdPct;
  if (priceListsEnabled !== undefined) update.priceListsEnabled = priceListsEnabled;
  if (maxDiscountPctBeforeApproval !== undefined) update.maxDiscountPctBeforeApproval = maxDiscountPctBeforeApproval;
  if (invoiceApprovalThresholdAmount !== undefined) update.invoiceApprovalThresholdAmount = invoiceApprovalThresholdAmount;
  if (requireReturnApproval !== undefined) update.requireReturnApproval = requireReturnApproval;
  if (requireRefundApproval !== undefined) update.requireRefundApproval = requireRefundApproval;

  const client = (await Client.findOneAndUpdate(
    { _id: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as ClientDoc;

  return res.status(200).json({ client: serializeClient(client) });
}
