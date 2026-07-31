import { ClientDoc } from './models/Client.js';

export interface SendResult {
  sent: boolean;
  error?: string;
}

/** Normalizes to notify.lk's expected Sri Lankan format (94-prefix), same as the Anura reference. */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('94')) return digits;
  if (digits.startsWith('0')) return `94${digits.slice(1)}`;
  return `94${digits}`;
}

/**
 * Real notify.lk gateway call — per-tenant credentials (Client.smsConfig),
 * not a shared platform key. Degrades gracefully (never throws) when a
 * tenant hasn't configured their own account yet, same "log the attempt,
 * don't pretend it worked" honesty as the Anura reference's own fallback.
 */
export async function sendSms(client: ClientDoc, to: string, message: string): Promise<SendResult> {
  const config = client.smsConfig;
  if (!config?.userId || !config?.apiKey) {
    return { sent: false, error: 'SMS not configured for this garage' };
  }

  const params = new URLSearchParams({
    user_id: config.userId,
    api_key: config.apiKey,
    sender_id: config.senderId || 'NotifyDEMO',
    to: normalizePhone(to),
    message,
  });

  try {
    const response = await fetch(`https://app.notify.lk/api/v1/send?${params.toString()}`, { method: 'GET' });
    const data = await response.json().catch(() => ({}) as Record<string, unknown>);
    if (data.status === 'success') return { sent: true };
    return { sent: false, error: typeof data.message === 'string' ? data.message : 'SMS gateway rejected the request' };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : 'SMS gateway request failed' };
  }
}
