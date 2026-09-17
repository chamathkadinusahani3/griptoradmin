import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { AdvancePayment, AdvancePaymentDoc, ADVANCE_PAYMENT_METHODS } from '../../models/AdvancePayment.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { requireTenantPermission } from '../../auth.js';
import { generateSequentialNumber } from '../../numbering.js';
import { serializeAdvancePayment } from '../../serializers.js';
import { postJournalEntry, getAccountIdsByNames, cashOrBankAccountName } from '../../journal.js';

interface CreateAdvancePaymentBody {
  direction?: 'customer' | 'supplier';
  customerId?: string;
  supplierId?: string;
  amount?: number;
  method?: (typeof ADVANCE_PAYMENT_METHODS)[number];
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

async function withNames(clientId: string, payments: AdvancePaymentDoc[]) {
  if (payments.length === 0) return [];

  const customerIds = [...new Set(payments.map((p) => p.customerId?.toString()).filter((id): id is string => !!id))];
  const supplierIds = [...new Set(payments.map((p) => p.supplierId?.toString()).filter((id): id is string => !!id))];

  const [customers, suppliers] = await Promise.all([
    customerIds.length > 0 ? (Customer.find({ _id: { $in: customerIds }, clientId }).select('name').lean() as Promise<CustomerDoc[]>) : Promise.resolve([]),
    supplierIds.length > 0 ? (Supplier.find({ _id: { $in: supplierIds }, clientId }).select('name').lean() as Promise<SupplierDoc[]>) : Promise.resolve([]),
  ]);
  const custNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));
  const supNameById = new Map(suppliers.map((s) => [s._id.toString(), s.name]));

  return payments.map((p) =>
    serializeAdvancePayment(p, {
      customerName: p.customerId ? custNameById.get(p.customerId.toString()) : undefined,
      supplierName: p.supplierId ? supNameById.get(p.supplierId.toString()) : undefined,
    })
  );
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'advance-payments:view');
  if (!session) return;

  const { direction, status } = req.query;
  await connectToDatabase();
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof direction === 'string') filter.direction = direction;
  if (typeof status === 'string') filter.status = status;

  const payments = (await AdvancePayment.find(filter).sort({ date: -1 }).lean()) as AdvancePaymentDoc[];
  return res.status(200).json({ advancePayments: await withNames(session.clientId, payments) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'advance-payments:manage');
  if (!session) return;

  const body = (req.body ?? {}) as CreateAdvancePaymentBody;
  const { direction, customerId, supplierId, amount, method, chequeNumber, bankAccountId, notes } = body;

  if (direction !== 'customer' && direction !== 'supplier') {
    return res.status(400).json({ error: 'direction must be "customer" or "supplier"' });
  }
  if (direction === 'customer' && !customerId) return res.status(400).json({ error: 'customerId is required for a customer advance payment' });
  if (direction === 'supplier' && !supplierId) return res.status(400).json({ error: 'supplierId is required for a supplier advance payment' });
  if (amount == null || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (!method || !ADVANCE_PAYMENT_METHODS.includes(method)) {
    return res.status(400).json({ error: 'Invalid method' });
  }
  if (method === 'Cheque' && !chequeNumber?.trim()) {
    return res.status(400).json({ error: 'chequeNumber is required for a Cheque advance payment' });
  }
  const date = body.date ? new Date(body.date) : new Date();
  if (Number.isNaN(date.getTime())) return res.status(400).json({ error: 'Invalid date' });

  await connectToDatabase();

  let customer: CustomerDoc | null = null;
  let supplier: SupplierDoc | null = null;
  if (direction === 'customer') {
    customer = (await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean()) as CustomerDoc | null;
    if (!customer) return res.status(400).json({ error: 'Customer not found' });
  } else {
    supplier = (await Supplier.findOne({ _id: supplierId, clientId: session.clientId }).lean()) as SupplierDoc | null;
    if (!supplier) return res.status(400).json({ error: 'Supplier not found' });
  }

  const advancePaymentNumber = await generateSequentialNumber(AdvancePayment, session.clientId, 'advancePaymentNumber', 'advancePayment');
  const payment = await AdvancePayment.create({
    clientId: session.clientId,
    advancePaymentNumber,
    direction,
    customerId: direction === 'customer' ? customerId : undefined,
    supplierId: direction === 'supplier' ? supplierId : undefined,
    amount,
    method,
    chequeNumber: method === 'Cheque' ? chequeNumber : undefined,
    bankAccountId: bankAccountId || undefined,
    date,
    appliedAmount: 0,
    remainingAmount: amount,
    notes,
  });

  // Best-effort, same non-blocking reasoning as every other GL posting
  // outside an existing transaction in this codebase — real cash moved, so
  // (unlike Credit/Debit Notes) this document posts its own entry. Reuses
  // Accounts Receivable/Payable pushed into a credit-balance position, the
  // exact technique Receipt's on-account remainder already established.
  try {
    const accountName = cashOrBankAccountName(method);
    const otherAccountName = direction === 'customer' ? 'Accounts Receivable' : 'Accounts Payable';
    const accountIds = await getAccountIdsByNames(session.clientId, [accountName, otherAccountName]);
    const cashOrBankId = accountIds.get(accountName);
    const otherId = accountIds.get(otherAccountName);
    if (cashOrBankId && otherId) {
      await postJournalEntry({
        clientId: session.clientId,
        description: direction === 'customer' ? `Advance from ${customer?.name}` : `Advance to ${supplier?.name}`,
        sourceType: direction === 'customer' ? 'customer-payment' : 'supplier-payment',
        sourceId: payment._id.toString(),
        lines:
          direction === 'customer'
            ? [{ accountId: cashOrBankId, debit: amount }, { accountId: otherId, credit: amount }]
            : [{ accountId: otherId, debit: amount }, { accountId: cashOrBankId, credit: amount }],
      });
    }
  } catch (err) {
    console.error('Journal posting failed for advance payment', payment._id.toString(), err);
  }

  const [serialized] = await withNames(session.clientId, [payment.toObject()]);
  return res.status(201).json({ advancePayment: serialized });
}
