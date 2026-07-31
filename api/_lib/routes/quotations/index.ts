import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Quotation, QuotationDoc } from '../../models/Quotation.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { JobCard, JobCardDoc } from '../../models/JobCard.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeQuotation } from '../../serializers.js';
import { computeTotals, LineItemInput } from '../../accounting.js';
import { generateSequentialNumber } from '../../numbering.js';
import { getEffectiveDiscountPct } from '../../creditDiscipline.js';
import { checkCreditExposureLimit } from '../../salesExecCredit.js';

interface CreateQuotationBody {
  customerId?: string;
  jobCardId?: string;
  vehicle?: string;
  plate?: string;
  items?: LineItemInput[];
  validUntil?: string;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'quotations:view');
  if (!session) return;

  await connectToDatabase();
  const quotations = (await Quotation.find({ clientId: session.clientId }).sort({ createdAt: -1 }).lean()) as QuotationDoc[];
  const customers = (await Customer.find({ clientId: session.clientId }).lean()) as CustomerDoc[];
  const customerNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));

  return res.status(200).json({
    quotations: quotations.map((q) => serializeQuotation(q, customerNameById.get(q.customerId.toString()))),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'quotations:manage');
  if (!session) return;

  const { customerId, jobCardId, vehicle, plate, items, validUntil, notes } = (req.body ?? {}) as CreateQuotationBody;
  if (!customerId || !vehicle || !items || items.length === 0) {
    return res.status(400).json({ error: 'customerId, vehicle, and at least one item are required' });
  }

  await connectToDatabase();

  const customer = (await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean()) as CustomerDoc | null;
  if (!customer) return res.status(400).json({ error: 'Unknown customer' });

  // When a job card is linked, the vehicle/plate/vehicleId come from that
  // authoritative record rather than whatever the client sent — closes a
  // trust gap left open since Phase 4 (the client-sent vehicle/plate were
  // never actually verified against the linked job card).
  let vehicleFields = { vehicle, plate, vehicleId: undefined as string | undefined };
  if (jobCardId) {
    const jobCard = (await JobCard.findOne({ _id: jobCardId, clientId: session.clientId }).lean()) as JobCardDoc | null;
    if (!jobCard) return res.status(400).json({ error: 'Unknown job card' });
    vehicleFields = { vehicle: jobCard.vehicle, plate: jobCard.plate ?? undefined, vehicleId: jobCard.vehicleId?.toString() };
  }

  const effectiveDiscountPct = await getEffectiveDiscountPct(customer, session.clientId);
  const { items: computedItems, subtotal, discountPct, discountAmount, taxAmount, total } = computeTotals(
    items,
    effectiveDiscountPct
  );

  const limitCheck = await checkCreditExposureLimit(session, customer, total);
  if (limitCheck.blocked) return res.status(400).json({ error: limitCheck.message });

  const quoteNumber = await generateSequentialNumber(Quotation, session.clientId, 'quoteNumber', 'QT');

  const quotation = await Quotation.create({
    clientId: session.clientId,
    customerId,
    jobCardId: jobCardId || undefined,
    quoteNumber,
    ...vehicleFields,
    items: computedItems,
    subtotal,
    discountPct,
    discountAmount,
    taxAmount,
    total,
    validUntil: validUntil ? new Date(validUntil) : undefined,
    notes,
  });

  return res
    .status(201)
    .json({ quotation: serializeQuotation(quotation.toObject(), (customer as CustomerDoc).name) });
}
