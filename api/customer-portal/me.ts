import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Customer, CustomerDoc } from '../_lib/models/Customer';
import { Client, ClientDoc } from '../_lib/models/Client';
import { requireCustomer } from '../_lib/auth';
import { serializeCustomer } from '../_lib/serializers';

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
