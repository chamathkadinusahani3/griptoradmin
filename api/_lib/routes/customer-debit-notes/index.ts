import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { CustomerDebitNote, CustomerDebitNoteDoc } from '../../models/CustomerDebitNote.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { requireTenantPermission } from '../../auth.js';
import { generateSequentialNumber } from '../../numbering.js';
import { serializeCustomerDebitNote } from '../../serializers.js';

interface CreateCustomerDebitNoteBody {
  customerInvoiceId?: string;
  amount?: number;
  reason?: string;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function withLabels(clientId: string, notes: CustomerDebitNoteDoc[]) {
  if (notes.length === 0) return [];

  const invoiceIds = [...new Set(notes.map((n) => n.customerInvoiceId.toString()))];
  const customerIds = [...new Set(notes.map((n) => n.customerId.toString()))];
  const [invoices, customers] = await Promise.all([
    CustomerInvoice.find({ _id: { $in: invoiceIds }, clientId }).select('invoiceNumber').lean() as Promise<CustomerInvoiceDoc[]>,
    Customer.find({ _id: { $in: customerIds }, clientId }).select('name').lean() as Promise<CustomerDoc[]>,
  ]);
  const invoiceNumberById = new Map(invoices.map((i) => [i._id.toString(), i.invoiceNumber]));
  const customerNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));

  return notes.map((n) => serializeCustomerDebitNote(n, invoiceNumberById.get(n.customerInvoiceId.toString()), customerNameById.get(n.customerId.toString())));
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'customer-debit-notes:view');
  if (!session) return;

  const { status } = req.query;
  await connectToDatabase();

  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof status === 'string') filter.status = status;

  const notes = (await CustomerDebitNote.find(filter).sort({ createdAt: -1 }).lean()) as CustomerDebitNoteDoc[];
  return res.status(200).json({ customerDebitNotes: await withLabels(session.clientId, notes) });
}

// Unlike the supplier-direction DebitNote (only ever auto-created alongside
// a Return), this one is manually raised directly against an existing
// CustomerInvoice — there is no Return in this flow at all.
async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'customer-debit-notes:manage');
  if (!session) return;

  const { customerInvoiceId, amount, reason, notes } = (req.body ?? {}) as CreateCustomerDebitNoteBody;
  if (!customerInvoiceId || amount == null || amount <= 0 || !reason?.trim()) {
    return res.status(400).json({ error: 'customerInvoiceId, a positive amount, and a reason are required' });
  }

  await connectToDatabase();

  const invoice = (await CustomerInvoice.findOne({ _id: customerInvoiceId, clientId: session.clientId }).lean()) as CustomerInvoiceDoc | null;
  if (!invoice) return res.status(400).json({ error: 'Invoice not found' });
  if (invoice.status === 'Void') return res.status(400).json({ error: 'Cannot raise a debit note against a voided invoice' });

  const debitNoteNumber = await generateSequentialNumber(CustomerDebitNote, session.clientId, 'debitNoteNumber', 'customerDebitNote');

  const note = await CustomerDebitNote.create({
    clientId: session.clientId,
    debitNoteNumber,
    customerId: invoice.customerId,
    customerInvoiceId,
    amount,
    reason: reason.trim(),
    notes,
  });

  const customer = (await Customer.findById(invoice.customerId).select('name').lean()) as CustomerDoc | null;
  return res.status(201).json({ customerDebitNote: serializeCustomerDebitNote(note.toObject(), invoice.invoiceNumber, customer?.name) });
}
