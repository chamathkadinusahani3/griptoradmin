import crypto from 'crypto';

/**
 * A one-time plaintext temporary password, shown once to the caller (never
 * stored anywhere itself — only its bcrypt hash is persisted). The same
 * trust-boundary substitute for real email delivery already used by
 * customers/[id]/portal-password.ts (identical algorithm, now shared since
 * this feature adds two more call sites for it).
 */
export function generateTempPassword(): string {
  // 10 chars from a readable alphabet (no ambiguous 0/O/1/l), easy to read
  // aloud or write down.
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
