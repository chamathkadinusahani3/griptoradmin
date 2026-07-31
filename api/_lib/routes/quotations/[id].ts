import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Quotation, QuotationDoc } from '../../models/Quotation.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeQuotation } from '../../serializers.js';
import { computeTotals, LineItemInput } from '../../accounting.js';

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

  const session = await requireTenantPermission(req, res, 'quotations:manage');
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
