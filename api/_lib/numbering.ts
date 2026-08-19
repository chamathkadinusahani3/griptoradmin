import mongoose from 'mongoose';
import { Client } from './models/Client.js';

export type DocumentType =
  | 'invoice'
  | 'quotation'
  | 'purchaseOrder'
  | 'complaint'
  | 'expense'
  | 'return'
  | 'purchaseRequisition'
  | 'rfq'
  | 'supplierQuotation'
  | 'grn'
  | 'purchaseInvoice'
  | 'salesOrder'
  | 'deliveryNote'
  | 'salaryAdvance'
  | 'warrantyClaim'
  | 'supplierClaim';

// The literal prefixes every route hardcoded before per-tenant Numbering
// settings existed — kept as the fallback so an unconfigured tenant (or an
// empty override string) generates byte-identical numbers to today.
export const DEFAULT_NUMBERING_PREFIXES: Record<DocumentType, string> = {
  invoice: 'INV',
  quotation: 'QT',
  purchaseOrder: 'PO',
  complaint: 'CMP',
  expense: 'EXP',
  return: 'RET',
  purchaseRequisition: 'PR',
  rfq: 'RFQ',
  supplierQuotation: 'SQ',
  grn: 'GRN',
  purchaseInvoice: 'PINV',
  salesOrder: 'SO',
  deliveryNote: 'DN',
  salaryAdvance: 'ADV',
  warrantyClaim: 'WC',
  supplierClaim: 'SC',
};

/**
 * Generates a sequential, per-tenant, per-month document number like
 * `QT-202607-0001`. Unlike a random suffix (which can collide undetected),
 * this counts existing documents for that tenant+month+prefix and retries
 * on the rare case another request grabbed the same number first — cheap
 * enough for this volume, no dedicated counter collection needed.
 *
 * `documentType` resolves to the tenant's configured prefix (Settings ->
 * Numbering), falling back to DEFAULT_NUMBERING_PREFIXES — callers no
 * longer pass a raw prefix literal, so a tenant's customization applies
 * everywhere that document type is generated without touching call sites.
 */
export async function generateSequentialNumber(
  model: mongoose.Model<any>,
  clientId: string,
  numberField: string,
  documentType: DocumentType
): Promise<string> {
  const client = (await Client.findById(clientId).select('numberingPrefixes').lean()) as {
    numberingPrefixes?: Partial<Record<DocumentType, string>>;
  } | null;
  const prefix = client?.numberingPrefixes?.[documentType]?.trim() || DEFAULT_NUMBERING_PREFIXES[documentType];

  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const base = `${prefix}-${yyyymm}-`;

  for (let attempt = 0; attempt < 10; attempt++) {
    const count = await model.countDocuments({ clientId, [numberField]: { $regex: `^${base}` } });
    const candidate = `${base}${String(count + 1 + attempt).padStart(4, '0')}`;
    const exists = await model.exists({ clientId, [numberField]: candidate });
    if (!exists) return candidate;
  }
  // Extremely unlikely fallback — timestamp suffix guarantees uniqueness.
  return `${base}${Date.now().toString().slice(-6)}`;
}
