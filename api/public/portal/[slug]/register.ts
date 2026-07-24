import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '../../../_lib/db';
import { Client, ClientDoc } from '../../../_lib/models/Client';
import { Customer, CustomerDoc } from '../../../_lib/models/Customer';
import { signCustomerSession, setCustomerSessionCookie } from '../../../_lib/auth';
import { serializeCustomer } from '../../../_lib/serializers';

interface RegisterBody {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
}

// Public, unauthenticated — same-origin, same convention as
// api/public/bookings/[slug]/index.ts and api/public/inspections/[token].ts.
//
// Deliberately only creates a BRAND NEW Customer — never attaches a password
// to an existing record found by email match, even if that record has no
// passwordHash yet. Doing so would let anyone with a customer's email
// address take over their existing profile/vehicle/job/invoice history,
// since griptoradmin has no email-verification infrastructure to prove the
// registrant actually owns that inbox (see Phase 7 plan). Existing
// customers get portal access via staff (api/customers/[id]/portal-password.ts).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug } = req.query;
  if (typeof slug !== 'string') return res.status(400).json({ error: 'Missing slug' });

  const { name, email, phone, password } = (req.body ?? {}) as RegisterBody;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  await connectToDatabase();

  const client = (await Client.findOne({ slug }).lean()) as ClientDoc | null;
  if (!client) return res.status(404).json({ error: 'Not found' });

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await Customer.findOne({ clientId: client._id, email: normalizedEmail }).lean();
  if (existing) {
    return res.status(409).json({
      error: 'An account for this email already exists. Ask your garage to enable portal access, or contact them if you’ve forgotten your password.',
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const customer = (await Customer.create({
    clientId: client._id,
    name,
    email: normalizedEmail,
    phone,
    passwordHash,
  })) as unknown as CustomerDoc;

  const token = signCustomerSession({ customerId: customer._id.toString(), clientId: client._id.toString() });
  setCustomerSessionCookie(res, token);

  return res.status(201).json({ customer: serializeCustomer(customer), garageName: client.name });
}
