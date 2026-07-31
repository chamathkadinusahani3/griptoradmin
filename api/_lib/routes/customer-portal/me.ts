import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Client, ClientDoc } from '../../models/Client.js';
import { requireCustomer } from '../../auth.js';
import { serializeCustomer } from '../../serializers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireCustomer(req, res);
  if (!session) return;

  await connectToDatabase();

  const customer = (await Customer.findOne({ _id: session.customerId, clientId: session.clientId }).lean()) as CustomerDoc | null;
  if (!customer) return res.status(404).json({ error: 'Not found' });
  const client = (await Client.findById(session.clientId).lean()) as ClientDoc | null;

  return res.status(200).json({ customer: serializeCustomer(customer), garageName: client?.name, garageSlug: client?.slug });
}
