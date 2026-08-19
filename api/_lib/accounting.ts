import { Client } from './models/Client.js';

// Fallback when a tenant hasn't set (or has cleared) Client.taxRatePct —
// matches the TAX_RATE=0.08 every route used to hardcode before Tax
// settings existed, so an unconfigured tenant computes byte-identical
// totals to today. A percentage (8 means 8%), not a fraction.
export const DEFAULT_TAX_RATE_PCT = 8;

export async function getTaxRatePct(clientId: string): Promise<number> {
  const client = (await Client.findById(clientId).select('taxRatePct').lean()) as { taxRatePct?: number } | null;
  return client?.taxRatePct ?? DEFAULT_TAX_RATE_PCT;
}

export interface LineItemInput {
  description?: string;
  quantity?: number;
  unitPrice?: number;
}

export interface ComputedTotals {
  items: { description: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
}

/**
 * Computes subtotal/discount/tax/total from line items — always server-side,
 * never trusted from the client (the core discipline this phase enforces
 * that the Anura reference doesn't: it spreads client-sent totals into the
 * document verbatim on both create and update). `discountPct` is applied to
 * the subtotal before tax (tax is charged on the discounted amount) — the
 * real, tenant-configurable-per-customer fix for Anura's corporate-discount
 * feature, which hardcodes 10% regardless of what's actually configured.
 */
export function computeTotals(itemsInput: LineItemInput[], discountPct: number, taxRatePct: number): ComputedTotals {
  const items = itemsInput.map((i) => ({
    description: String(i.description ?? ''),
    quantity: Number(i.quantity) || 0,
    unitPrice: Number(i.unitPrice) || 0,
  }));
  const subtotal = Math.round(items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0) * 100) / 100;
  const clampedDiscountPct = Math.min(100, Math.max(0, Number(discountPct) || 0));
  const discountAmount = Math.round(subtotal * (clampedDiscountPct / 100) * 100) / 100;
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = Math.round(taxableAmount * (taxRatePct / 100) * 100) / 100;
  const total = Math.round((taxableAmount + taxAmount) * 100) / 100;
  return { items, subtotal, discountPct: clampedDiscountPct, discountAmount, taxAmount, total };
}
