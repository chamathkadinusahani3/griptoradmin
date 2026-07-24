/**
 * One-off script to create (or reset the password of) a login user.
 * Not a Vercel function — run directly with tsx, e.g.:
 *
 *   npx tsx api/_lib/seed.ts --role super --name "Alex Rivera" --email alex@griptor.io --password "yourpassword"
 *   npx tsx api/_lib/seed.ts --role tenant --name "Priya Nair" --email priya@apexautocare.com --password "yourpassword" --garage "Apex Auto Care"
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import bcrypt from 'bcryptjs';
import { connectToDatabase } from './db';
import { User } from './models/User';
import { Client } from './models/Client';

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    const value = args[i + 1];
    if (key && value !== undefined) out[key] = value;
  }
  return out;
}

async function main() {
  const { role, name, email, password, garage } = parseArgs();

  if (!role || !name || !email || !password) {
    console.error(
      'Usage: npx tsx api/_lib/seed.ts --role <super|tenant> --name "Full Name" --email you@example.com --password "secret" [--garage "Garage Name"]'
    );
    process.exit(1);
  }
  if (role !== 'super' && role !== 'tenant') {
    console.error('--role must be "super" or "tenant"');
    process.exit(1);
  }
  if (role === 'tenant' && !garage) {
    console.error('--garage is required when --role is tenant');
    process.exit(1);
  }

  await connectToDatabase();

  const normalizedEmail = email.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(password, 10);

  let clientId: string | undefined;
  if (role === 'tenant') {
    const client = await Client.findOneAndUpdate(
      { name: garage },
      {
        $setOnInsert: {
          name: garage,
          contact: name,
          email: normalizedEmail,
          plan: 'Starter',
          status: 'Trial',
        },
      },
      { upsert: true, returnDocument: 'after' }
    );
    clientId = client._id.toString();
  }

  const doc = await User.findOneAndUpdate(
    { email: normalizedEmail },
    { name, email: normalizedEmail, passwordHash, role, clientId },
    { upsert: true, returnDocument: 'after' }
  );

  console.log(`Seeded ${role} user: ${doc.email} (id ${doc._id})${clientId ? ` — linked to client ${clientId}` : ''}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
