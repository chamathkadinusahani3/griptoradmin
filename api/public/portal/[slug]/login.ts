import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '../../../_lib/db';
import { Client, ClientDoc } from '../../../_lib/models/Client';
import { Customer, CustomerDoc } from '../../../_lib/models/Customer';
import { signCustomerSession, setCustomerSessionCookie } from '../../../_lib/auth';
import { serializeCustomer } from '../../../_lib/serializers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug } = req.query;
  if (typeof slug !== 'string') return res.status(400).json({ error: 'Missing slug' });

  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  await connectToDatabase();

  const client = (await Client.findOne({ slug }).lean()) as ClientDoc | null;
  if (!client) return res.status(404).json({ error: 'Not found' });

  const customer = (await Customer.findOne({
    clientId: client._id,
    email: email.toLowerCase().trim(),
  }).lean()) as CustomerDoc | null;

  // Same generic message whether the customer doesn't exist, exists but has
  // no portal access yet, or the password is wrong — never reveal which.
  if (!customer || !customer.passwordHash) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const valid = await bcrypt.compare(password, customer.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signCustomerSession({ customerId: customer._id.toString(), clientId: client._id.toString() });
  setCustomerSessionCookie(res, token);

  return res.status(200).json({ customer: serializeCustomer(customer), garageName: client.name });
}
