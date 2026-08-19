import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Prospect, ProspectDoc } from '../../../models/Prospect.js';
import { Customer } from '../../../models/Customer.js';
import { requireTenantPermission } from '../../../auth.js';
import { serializeCustomer } from '../../../serializers.js';

// Creates the real Customer a won prospect becomes — same "convert"
// pattern as Quotation -> CustomerInvoice and SupplierQuotation -> PurchaseOrder.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'prospects:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing prospect id' });

  await connectToDatabase();

  const prospect = (await Prospect.findOne({ _id: id, clientId: session.clientId }).lean()) as ProspectDoc | null;
  if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
  if (prospect.status === 'Converted') return res.status(400).json({ error: 'This prospect has already been converted' });
  if (!prospect.email) return res.status(400).json({ error: 'This prospect needs an email before it can become a customer' });

  const existingCustomer = await Customer.findOne({ clientId: session.clientId, email: prospect.email.toLowerCase().trim() }).lean();
  if (existingCustomer) return res.status(409).json({ error: 'A customer with this email already exists' });

  const customer = await Customer.create({
    clientId: session.clientId,
    name: prospect.name,
    email: prospect.email.toLowerCase().trim(),
    phone: prospect.phone,
    type: 'individual',
    tags: [],
  });

  await Prospect.updateOne(
    { _id: id, clientId: session.clientId },
    { status: 'Converted', convertedCustomerId: customer._id }
  );

  return res.status(201).json({ customer: serializeCustomer(customer.toObject()) });
}
