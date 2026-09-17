import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Receipt, ReceiptDoc, RECEIPT_METHODS } from '../../models/Receipt.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { requireTenantPermission } from '../../auth.js';
import { generateSequentialNumber } from '../../numbering.js';
import { serializeReceipt } from '../../serializers.js';
import { recordCustomerInvoicePayment } from '../../customerInvoicePayments.js';
import { postJournalEntry, getAccountIdsByNames, cashOrBankAccountName } from '../../journal.js';

interface AllocationBody {
  invoiceId?: string;
  amount?: number;
}

interface CreateReceiptBody {
  customerId?: string;
  amount?: number;
  method?: (typeof RECEIPT_METHODS)[number];
  chequeNumber?: string;
  bankAccountId?: string;
  date?: string;
  allocations?: AllocationBody[];
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function withNames(clientId: string, receipts: ReceiptDoc[]) {
  if (receipts.length === 0) return [];

  const customerIds = [...new Set(receipts.map((r) => r.customerId.toString()))];
  const invoiceIds = [...new Set(receipts.flatMap((r) => r.allocations.map((a) => a.invoiceId.toString())))];

  const [customers, invoices] = await Promise.all([
    Customer.find({ _id: { $in: customerIds }, clientId }).select('name').lean() as Promise<CustomerDoc[]>,
    invoiceIds.length > 0
      ? (CustomerInvoice.find({ _id: { $in: invoiceIds }, clientId }).select('invoiceNumber').lean() as Promise<CustomerInvoiceDoc[]>)
      : Promise.resolve([]),
  ]);
  const custNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));
  const invoiceNumberById = new Map(invoices.map((i) => [i._id.toString(), i.invoiceNumber]));

  return receipts.map((r) => serializeReceipt(r, { customerName: custNameById.get(r.customerId.toString()), invoiceNumberById }));
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'receipts:view');
  if (!session) return;

  const { customerId } = req.query;
  await connectToDatabase();
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof customerId === 'string') filter.customerId = customerId;

  const receipts = (await Receipt.find(filter).sort({ date: -1 }).lean()) as ReceiptDoc[];
  return res.status(200).json({ receipts: await withNames(session.clientId, receipts) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'receipts:manage');
  if (!session) return;

  const body = (req.body ?? {}) as CreateReceiptBody;
  const { customerId, amount, method, chequeNumber, bankAccountId, date: dateStr, allocations, notes } = body;

  if (!customerId || amount == null || !method) {
    return res.status(400).json({ error: 'customerId, amount, and method are required' });
  }
  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (!RECEIPT_METHODS.includes(method)) {
    return res.status(400).json({ error: 'Invalid method' });
  }
  if (method === 'Cheque' && !chequeNumber?.trim()) {
    return res.status(400).json({ error: 'chequeNumber is required for a Cheque receipt' });
  }
  const date = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(date.getTime())) return res.status(400).json({ error: 'Invalid date' });

  const requestedAllocations: { invoiceId: string; amount: number }[] = [];
  for (const a of allocations ?? []) {
    if (!a.invoiceId) continue;
    if (typeof a.amount !== 'number' || a.amount <= 0) {
      return res.status(400).json({ error: 'Each allocation requires a positive amount' });
    }
    requestedAllocations.push({ invoiceId: a.invoiceId, amount: a.amount });
  }
  const allocatedTotal = Math.round(requestedAllocations.reduce((sum, a) => sum + a.amount, 0) * 100) / 100;
  if (allocatedTotal > amount) {
    return res.status(400).json({ error: 'Allocations cannot exceed the receipt amount' });
  }

  await connectToDatabase();

  const customer = (await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean()) as CustomerDoc | null;
  if (!customer) return res.status(400).json({ error: 'Customer not found' });

  // Validate every allocation's target invoice BEFORE applying any of them
  // — recordCustomerInvoicePayment() has no transaction of its own (same
  // established convention as collections/index.ts), so front-loading
  // validation is what keeps a bad invoiceId from leaving a receipt
  // half-applied across several invoices.
  const invoiceIds = requestedAllocations.map((a) => a.invoiceId);
  const invoices =
    invoiceIds.length > 0
      ? ((await CustomerInvoice.find({ _id: { $in: invoiceIds }, clientId: session.clientId, customerId }).lean()) as CustomerInvoiceDoc[])
      : [];
  const invoiceById = new Map(invoices.map((i) => [i._id.toString(), i]));
  for (const a of requestedAllocations) {
    const invoice = invoiceById.get(a.invoiceId);
    if (!invoice) return res.status(400).json({ error: `Invoice not found for this customer: ${a.invoiceId}` });
    if (invoice.status === 'Void') return res.status(400).json({ error: `Cannot allocate to a Void invoice (${invoice.invoiceNumber})` });
  }

  for (const a of requestedAllocations) {
    const updated = await recordCustomerInvoicePayment(a.invoiceId, session.clientId, {
      amount: a.amount,
      method,
      date,
      notes,
      chequeNumber: method === 'Cheque' ? chequeNumber : undefined,
      bankAccountId,
    });
    if (!updated) return res.status(400).json({ error: `Failed to apply payment to invoice ${a.invoiceId}` });
  }

  const onAccountAmount = Math.round((amount - allocatedTotal) * 100) / 100;

  const receiptNumber = await generateSequentialNumber(Receipt, session.clientId, 'receiptNumber', 'receipt');
  const receipt = await Receipt.create({
    clientId: session.clientId,
    receiptNumber,
    customerId,
    amount,
    method,
    chequeNumber: method === 'Cheque' ? chequeNumber : undefined,
    bankAccountId: bankAccountId || undefined,
    date,
    allocations: requestedAllocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })),
    onAccountAmount,
    notes,
  });

  // Only the unallocated remainder needs its own posting — the allocated
  // portion already posted through recordCustomerInvoicePayment() above,
  // exactly the same "delegate, don't double-post" branch
  // collections/index.ts uses for its own on-account case.
  if (onAccountAmount > 0) {
    try {
      const accountName = cashOrBankAccountName(method);
      const accountIds = await getAccountIdsByNames(session.clientId, [accountName, 'Accounts Receivable']);
      const cashOrBankId = accountIds.get(accountName);
      const arId = accountIds.get('Accounts Receivable');
      if (cashOrBankId && arId) {
        await postJournalEntry({
          clientId: session.clientId,
          description: `Receipt from ${customer.name}`,
          sourceType: 'customer-payment',
          sourceId: receipt._id.toString(),
          lines: [{ accountId: cashOrBankId, debit: onAccountAmount }, { accountId: arId, credit: onAccountAmount }],
        });
      }
    } catch (err) {
      console.error('Journal posting failed for receipt on-account remainder', receipt._id.toString(), err);
    }
  }

  const [serialized] = await withNames(session.clientId, [receipt.toObject()]);
  return res.status(201).json({ receipt: serialized });
}
