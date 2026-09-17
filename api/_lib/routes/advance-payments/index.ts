import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { AdvancePayment, AdvancePaymentDoc, ADVANCE_PAYMENT_METHODS } from '../../models/AdvancePayment.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeAdvancePayment } from '../../serializers.js';
import { createAdvancePayment } from '../../advancePayments.js';

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

  const payment = await createAdvancePayment({
    clientId: session.clientId,
    direction,
    customerId,
    supplierId,
    partyName: direction === 'customer' ? customer?.name : supplier?.name,
    amount,
    method,
    chequeNumber,
    bankAccountId,
    date,
    notes,
  });

  const [serialized] = await withNames(session.clientId, [payment]);
  return res.status(201).json({ advancePayment: serialized });
}
