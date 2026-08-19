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
  };
}

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

  const { name, contact, email, branding, address, phone, taxId, website, taxRatePct, fiscalYearStartMonth, numberingPrefixes } =
    (req.body ?? {}) as UpdateSettingsBody;

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

  const client = (await Client.findOneAndUpdate(
    { _id: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as ClientDoc;

  return res.status(200).json({ client: serializeClient(client) });
}
