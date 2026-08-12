import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Complaint, ComplaintDoc } from '../../models/Complaint.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { requireTenantPermission } from '../../auth.js';
import { generateSequentialNumber } from '../../numbering.js';
import { serializeComplaint } from '../../serializers.js';

interface CreateComplaintBody {
  direction?: 'customer' | 'supplier';
  customerId?: string;
  supplierId?: string;
  category?: string;
  subject?: string;
  description?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent';
  jobCardId?: string;
  purchaseOrderId?: string;
}

const CATEGORIES = ['Quality', 'Service', 'Billing', 'Delivery', 'Communication', 'Other'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'complaints:view');
  if (!session) return;

  await connectToDatabase();
  const { status, direction } = req.query;
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof status === 'string') filter.status = status;
  if (typeof direction === 'string') filter.direction = direction;

  const complaints = (await Complaint.find(filter).sort({ createdAt: -1 }).lean()) as ComplaintDoc[];
  const customerIds = complaints.filter((c) => c.customerId).map((c) => c.customerId);
  const supplierIds = complaints.filter((c) => c.supplierId).map((c) => c.supplierId);
  const [customers, suppliers] = await Promise.all([
    customerIds.length ? (Customer.find({ _id: { $in: customerIds } }).select('name').lean() as Promise<CustomerDoc[]>) : [],
    supplierIds.length ? (Supplier.find({ _id: { $in: supplierIds } }).select('name').lean() as Promise<SupplierDoc[]>) : [],
  ]);
  const customerNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));
  const supplierNameById = new Map(suppliers.map((s) => [s._id.toString(), s.name]));

  return res.status(200).json({
    complaints: complaints.map((c) =>
      serializeComplaint(
        c,
        c.customerId ? customerNameById.get(c.customerId.toString()) : c.supplierId ? supplierNameById.get(c.supplierId.toString()) : undefined
      )
    ),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'complaints:manage');
  if (!session) return;

  const { direction, customerId, supplierId, category, subject, description, priority, jobCardId, purchaseOrderId } =
    (req.body ?? {}) as CreateComplaintBody;

  if (!direction || (direction !== 'customer' && direction !== 'supplier')) {
    return res.status(400).json({ error: 'direction must be customer or supplier' });
  }
  if (direction === 'customer' && !customerId) return res.status(400).json({ error: 'customerId is required for a customer complaint' });
  if (direction === 'supplier' && !supplierId) return res.status(400).json({ error: 'supplierId is required for a supplier complaint' });
  if (!category || !CATEGORIES.includes(category)) return res.status(400).json({ error: 'A valid category is required' });
  if (!subject?.trim()) return res.status(400).json({ error: 'A subject is required' });
  if (!description?.trim()) return res.status(400).json({ error: 'A description is required' });

  await connectToDatabase();

  let partyName: string | undefined;
  if (direction === 'customer') {
    const customer = (await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean()) as CustomerDoc | null;
    if (!customer) return res.status(400).json({ error: 'Unknown customer' });
    partyName = customer.name;
  } else {
    const supplier = (await Supplier.findOne({ _id: supplierId, clientId: session.clientId }).lean()) as SupplierDoc | null;
    if (!supplier) return res.status(400).json({ error: 'Unknown supplier' });
    partyName = supplier.name;
  }

  const complaintNumber = await generateSequentialNumber(Complaint, session.clientId, 'complaintNumber', 'CMP');
  const complaint = await Complaint.create({
    clientId: session.clientId,
    direction,
    customerId: direction === 'customer' ? customerId : undefined,
    supplierId: direction === 'supplier' ? supplierId : undefined,
    complaintNumber,
    category,
    subject: subject.trim(),
    description: description.trim(),
    priority: priority ?? 'Medium',
    status: 'Open',
    jobCardId: jobCardId || undefined,
    purchaseOrderId: purchaseOrderId || undefined,
  });

  return res.status(201).json({ complaint: serializeComplaint(complaint.toObject(), partyName) });
}
