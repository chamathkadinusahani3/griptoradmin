import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Quotation, QuotationDoc } from '../_lib/models/Quotation';
import { Customer, CustomerDoc } from '../_lib/models/Customer';
import { requireTenant } from '../_lib/auth';
import { serializeQuotation } from '../_lib/serializers';
import { computeTotals, LineItemInput } from '../_lib/accounting';

interface UpdateQuotationBody {
  vehicle?: string;
  plate?: string;
  items?: LineItemInput[];
  status?: 'Draft' | 'Pending' | 'Approved' | 'Rejected' | 'Invoiced';
  validUntil?: string;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing quotation id' });

  await connectToDatabase();

  // Scoped by BOTH _id and clientId — the write-by-id multi-tenancy boundary.
  const existing = (await Quotation.findOne({ _id: id, clientId: session.clientId }).lean()) as QuotationDoc | null;
  if (!existing) return res.status(404).json({ error: 'Quotation not found' });

  const body = (req.body ?? {}) as UpdateQuotationBody;
  const update: Record<string, unknown> = {};
  for (const key of ['vehicle', 'plate', 'status', 'notes'] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (body.validUntil !== undefined) update.validUntil = new Date(body.validUntil);
  // Totals are recomputed server-side whenever items change — never trusts
  // a client-sent total, on update just as on create. Preserves the
  // quotation's own existing discountPct rather than resetting it to 0.
  if (body.items !== undefined) {
    const { items, subtotal, discountPct, discountAmount, taxAmount, total } = computeTotals(
      body.items,
      existing.discountPct ?? 0
    );
    update.items = items;
    update.subtotal = subtotal;
    update.discountPct = discountPct;
    update.discountAmount = discountAmount;
    update.taxAmount = taxAmount;
    update.total = total;
  }

  const quotation = (await Quotation.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as QuotationDoc;

  const customer = (await Customer.findById(quotation.customerId).lean()) as CustomerDoc | null;

  return res.status(200).json({ quotation: serializeQuotation(quotation, customer?.name) });
}
