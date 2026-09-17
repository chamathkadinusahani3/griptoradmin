import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { CollectionRecord, CollectionRecordDoc, COLLECTION_METHODS } from '../../models/CollectionRecord.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { SalesVisit } from '../../models/SalesVisit.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeCollectionRecord } from '../../serializers.js';
import { recordCustomerInvoicePayment } from '../../customerInvoicePayments.js';
import { postJournalEntry, getAccountIdsByNames, cashOrBankAccountName } from '../../journal.js';

interface CreateCollectionBody {
  salespersonId?: string;
  customerId?: string;
  visitId?: string;
  invoiceId?: string;
  amount?: number;
  method?: (typeof COLLECTION_METHODS)[number];
  chequeNumber?: string;
  bankAccountId?: string;
  date?: string;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function withNames(clientId: string, collections: CollectionRecordDoc[]) {
  if (collections.length === 0) return [];

  const salespersonIds = [...new Set(collections.map((c) => c.salespersonId.toString()))];
  const customerIds = [...new Set(collections.map((c) => c.customerId.toString()))];
  const invoiceIds = [...new Set(collections.map((c) => c.invoiceId?.toString()).filter((id): id is string => !!id))];

  const [salespersons, customers, invoices] = await Promise.all([
    Salesperson.find({ _id: { $in: salespersonIds }, clientId }).lean() as Promise<SalespersonDoc[]>,
    Customer.find({ _id: { $in: customerIds }, clientId }).lean() as Promise<CustomerDoc[]>,
    invoiceIds.length > 0 ? (CustomerInvoice.find({ _id: { $in: invoiceIds }, clientId }).lean() as Promise<CustomerInvoiceDoc[]>) : Promise.resolve([]),
  ]);
  const spById = new Map(salespersons.map((s) => [s._id.toString(), s]));
  const custById = new Map(customers.map((c) => [c._id.toString(), c.name]));
  const invById = new Map(invoices.map((i) => [i._id.toString(), i.invoiceNumber]));

  return collections.map((c) =>
    serializeCollectionRecord(c, {
      salespersonName: spById.get(c.salespersonId.toString())?.name,
      salespersonCode: spById.get(c.salespersonId.toString())?.code,
      customerName: custById.get(c.customerId.toString()),
      invoiceNumber: c.invoiceId ? invById.get(c.invoiceId.toString()) : undefined,
    })
  );
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-collections:view');
  if (!session) return;

  const { salespersonId, customerId, visitId } = req.query;

  await connectToDatabase();
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof salespersonId === 'string') filter.salespersonId = salespersonId;
  if (typeof customerId === 'string') filter.customerId = customerId;
  if (typeof visitId === 'string') filter.visitId = visitId;

  const collections = (await CollectionRecord.find(filter).sort({ date: -1 }).lean()) as CollectionRecordDoc[];
  return res.status(200).json({ collections: await withNames(session.clientId, collections) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-collections:manage');
  if (!session) return;

  const body = (req.body ?? {}) as CreateCollectionBody;
  if (!body.salespersonId || !body.customerId || body.amount == null || !body.method) {
    return res.status(400).json({ error: 'salespersonId, customerId, amount, and method are required' });
  }
  if (typeof body.amount !== 'number' || body.amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (!COLLECTION_METHODS.includes(body.method)) {
    return res.status(400).json({ error: 'Invalid method' });
  }
  if (body.method === 'Cheque' && !body.chequeNumber) {
    return res.status(400).json({ error: 'chequeNumber is required for a Cheque collection' });
  }

  await connectToDatabase();

  const [salesperson, customer] = await Promise.all([
    Salesperson.findOne({ _id: body.salespersonId, clientId: session.clientId }).lean() as Promise<SalespersonDoc | null>,
    Customer.findOne({ _id: body.customerId, clientId: session.clientId }).lean() as Promise<CustomerDoc | null>,
  ]);
  if (!salesperson) return res.status(400).json({ error: 'Salesperson not found' });
  if (!customer) return res.status(400).json({ error: 'Customer not found' });

  if (body.visitId) {
    const visit = await SalesVisit.findOne({ _id: body.visitId, clientId: session.clientId }).lean();
    if (!visit) return res.status(400).json({ error: 'Visit not found' });
  }

  const date = body.date ? new Date(body.date) : new Date();
  if (Number.isNaN(date.getTime())) return res.status(400).json({ error: 'Invalid date' });

  if (body.invoiceId) {
    // Delegates to the existing payment-recording path — it already posts
    // its own GL entry, so this collection record must NOT post a second one.
    const invoice = (await CustomerInvoice.findOne({ _id: body.invoiceId, clientId: session.clientId, customerId: body.customerId }).lean()) as CustomerInvoiceDoc | null;
    if (!invoice) return res.status(400).json({ error: 'Invoice not found for this customer' });
    if (invoice.status === 'Void') return res.status(400).json({ error: 'Cannot collect against a Void invoice' });

    const updated = await recordCustomerInvoicePayment(body.invoiceId, session.clientId, {
      amount: body.amount,
      method: body.method,
      date,
      notes: body.notes,
      chequeNumber: body.chequeNumber,
      bankAccountId: body.bankAccountId,
    });
    if (!updated) return res.status(400).json({ error: 'Failed to record payment against invoice' });
  }

  const collection = await CollectionRecord.create({
    clientId: session.clientId,
    salespersonId: body.salespersonId,
    customerId: body.customerId,
    visitId: body.visitId || undefined,
    invoiceId: body.invoiceId || undefined,
    amount: body.amount,
    method: body.method,
    chequeNumber: body.chequeNumber,
    bankAccountId: body.bankAccountId || undefined,
    date,
    notes: body.notes,
  });

  // Only when NOT tied to a specific invoice — a general on-account
  // collection, so it credits Accounts Receivable directly rather than
  // recognizing revenue (that already happened at invoice-issue time).
  // Best-effort, same non-blocking reasoning as every other GL posting
  // outside an existing transaction in this codebase.
  if (!body.invoiceId) {
    try {
      const accountName = cashOrBankAccountName(body.method);
      const accountIds = await getAccountIdsByNames(session.clientId, [accountName, 'Accounts Receivable']);
      const cashOrBankId = accountIds.get(accountName);
      const arId = accountIds.get('Accounts Receivable');
      if (cashOrBankId && arId) {
        await postJournalEntry({
          clientId: session.clientId,
          description: `Collection from ${customer.name}`,
          sourceType: 'customer-payment',
          sourceId: collection._id.toString(),
          lines: [{ accountId: cashOrBankId, debit: body.amount }, { accountId: arId, credit: body.amount }],
        });
      }
    } catch (err) {
      console.error('Journal posting failed for collection', collection._id.toString(), err);
    }
  }

  const [serialized] = await withNames(session.clientId, [collection.toObject()]);
  return res.status(201).json({ collection: serialized });
}
