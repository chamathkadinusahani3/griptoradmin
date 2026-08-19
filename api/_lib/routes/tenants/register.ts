import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from '../../db.js';
import { Client, ClientDoc } from '../../models/Client.js';
import { User } from '../../models/User.js';
import { Role } from '../../models/Role.js';
import { applyPublicCors } from '../../cors.js';
import { serializeClient } from '../../serializers.js';
import { generateUniqueSlug } from '../../slug.js';
import { CORE_SEED_ROLES, CATALOG_SEED_ROLES } from '../../roleSeed.js';

const TRIAL_DAYS = 14;

interface RegisterBody {
  garageName?: string;
  contactName?: string;
  email?: string;
  password?: string;
  phone?: string;
  plan?: string;
}

const ALLOWED_SELF_SERVE_PLANS: Record<string, string> = { starter: 'Starter', professional: 'Professional' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyPublicCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { garageName, contactName, email, password, plan } = (req.body ?? {}) as RegisterBody;
  if (!garageName || !contactName || !email || !password) {
    return res.status(400).json({ error: 'garageName, contactName, email, and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const normalizedPlan = ALLOWED_SELF_SERVE_PLANS[(plan ?? '').toLowerCase()] ?? 'Starter';

  await connectToDatabase();
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await User.findOne({ email: normalizedEmail }).lean();
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const slug = await generateUniqueSlug(garageName);

  // App-managed trial — no payment gateway involved at signup at all.
  // PayHere (unlike Stripe) has no free-trial concept: a recurring plan
  // charges immediately on authorization. So the trial period is tracked
  // entirely locally via trialEndsAt; the tenant is only ever sent to a
  // real PayHere checkout once a real charge needs to happen (trial ending,
  // or an immediate upgrade) — that flow is PayHere Phase 2, not built yet.
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const session = await mongoose.startSession();
  try {
    let created: ClientDoc | undefined;
    await session.withTransaction(async () => {
      const [client] = await Client.create(
        [
          {
            name: garageName,
            contact: contactName,
            email: normalizedEmail,
            plan: normalizedPlan,
            status: 'Trial',
            locations: 1,
            staff: 1,
            mrr: 0,
            slug,
            trialEndsAt,
          },
        ],
        { session }
      );
      const roles = await Role.create(
        CORE_SEED_ROLES.map((r) => ({ clientId: client._id, ...r })),
        { session, ordered: true }
      );
      const ownerRole = roles.find((r) => r.isProtectedOwner)!;

      const passwordHash = await bcrypt.hash(password, 10);
      await User.create(
        [{ name: contactName, email: normalizedEmail, passwordHash, role: 'tenant', clientId: client._id, tenantRole: 'Owner', roleId: ownerRole._id }],
        { session }
      );
      created = client.toObject() as ClientDoc;
    });

    // Best-effort, outside the transaction — see clients/index.ts's identical
    // comment on why the name-only catalog can't be allowed to slow down or
    // fail self-serve signup.
    Role.insertMany(
      CATALOG_SEED_ROLES.map((r) => ({ clientId: created!._id, ...r })),
      { ordered: false }
    ).catch((err) => console.error('Catalog role backfill failed for new client', created!._id, err));

    return res.status(201).json({ client: serializeClient(created!) });
  } finally {
    await session.endSession();
  }
}
