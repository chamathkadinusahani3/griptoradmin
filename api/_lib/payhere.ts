import crypto from 'crypto';
import { CustomerInvoiceDoc } from './models/CustomerInvoice.js';
import { ClientDoc } from './models/Client.js';
import { getPlanPriceLkr } from './griptorPricingLkr.js';

/** order_id prefix for a Griptor plan-subscription checkout — lets the notify callback (api/public/payhere-notify.ts) tell this apart from a CustomerInvoice payment (whose order_id is always a bare Mongo id, never starting with this). */
export const PLAN_ORDER_PREFIX = 'PLAN_';

/** Parses a plan-checkout order_id (`PLAN_<clientId>_<timestamp>`) back into the clientId, or null if it isn't one. */
export function parsePlanOrderClientId(orderId: string): string | null {
  if (!orderId.startsWith(PLAN_ORDER_PREFIX)) return null;
  const rest = orderId.slice(PLAN_ORDER_PREFIX.length);
  const clientId = rest.split('_')[0];
  return clientId || null;
}

export interface PayHereConfig {
  merchantId: string;
  merchantSecret: string;
  mode: 'sandbox' | 'live';
}

/** Lazily read/validated so importing this module never throws before the manual PayHere setup step is done — only actually building a checkout does. */
export function getPayHereConfig(): PayHereConfig {
  const merchantId = process.env.PAYHERE_MERCHANT_ID;
  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
  if (!merchantId || !merchantSecret) {
    throw new Error('PAYHERE_MERCHANT_ID / PAYHERE_MERCHANT_SECRET are not set. Add them to griptoradmin/.env.local');
  }
  const mode = process.env.PAYHERE_MODE === 'live' ? 'live' : 'sandbox';
  return { merchantId, merchantSecret, mode };
}

export function getCheckoutActionUrl(): string {
  const { mode } = getPayHereConfig();
  return mode === 'live' ? 'https://www.payhere.lk/pay/checkout' : 'https://sandbox.payhere.lk/pay/checkout';
}

function md5(value: string): string {
  return crypto.createHash('md5').update(value).digest('hex').toUpperCase();
}

/** PayHere requires amounts formatted to exactly 2 decimal places, no thousands separators (e.g. "1500.00", not "1,500.00" or "1500"). */
export function formatPayHereAmount(amount: number): string {
  return amount.toFixed(2);
}

/**
 * The outgoing-request hash — proves this checkout request genuinely came
 * from our server (which knows merchant_secret), not a tampered client
 * request. Formula per PayHere's own docs:
 *   hash = upper(md5(merchant_id + order_id + amount + upper(md5(merchant_secret))))
 */
export function generateCheckoutHash(orderId: string, amount: number, currency: string): string {
  const { merchantId, merchantSecret } = getPayHereConfig();
  const formattedAmount = formatPayHereAmount(amount);
  return md5(merchantId + orderId + formattedAmount + md5(merchantSecret));
}

export interface NotificationParams {
  merchant_id: string;
  order_id: string;
  payhere_amount: string;
  payhere_currency: string;
  status_code: string;
  md5sig: string;
}

/**
 * The incoming notify_url callback signature check — the ONLY thing that
 * authenticates a payment notification as genuinely from PayHere (there's
 * no signed-header/SDK verification the way Stripe had). Formula:
 *   md5sig = upper(md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + upper(md5(merchant_secret))))
 * A caller MUST check this returns true before ever recording a payment.
 */
export function verifyNotificationSignature(params: NotificationParams): boolean {
  const { merchantSecret } = getPayHereConfig();
  const expected = md5(
    params.merchant_id + params.order_id + params.payhere_amount + params.payhere_currency + params.status_code + md5(merchantSecret)
  );
  return expected === params.md5sig.toUpperCase();
}

export interface CustomerContact {
  name: string;
  email: string;
  phone?: string | null;
}

/**
 * Builds the full PayHere checkout form field set for paying a
 * CustomerInvoice's current balance (the garage's own currency/amount —
 * untouched by the Griptor-billing LKR conversion, that's a separate,
 * later concern). order_id is the invoice's own id — PayHere's only
 * correlation key, no separate "session id" concept the way Stripe had.
 *
 * KNOWN GAP: PayHere requires first_name/last_name/address/city/country as
 * mandatory fields, but griptoradmin's Customer model only ever stored a
 * single `name` string and no address at all (never needed one before this
 * gateway's requirements). Falls back to a naive name split and placeholder
 * location fields — real address collection isn't in scope for this phase.
 */
export function buildInvoiceCheckoutFields(
  invoice: CustomerInvoiceDoc,
  customer: CustomerContact,
  opts: { returnUrl: string; cancelUrl: string; notifyUrl: string }
): Record<string, string> {
  const [firstName, ...rest] = customer.name.trim().split(/\s+/);
  const lastName = rest.join(' ') || firstName;
  const amount = formatPayHereAmount(invoice.balance);
  // USD, not LKR — CustomerInvoice amounts are the garage's own currency
  // (this app's existing USD figures, untouched). PayHere supports USD
  // settlement directly (per its docs: "Currency code (LKR/USD)"). LKR is
  // only for Griptor's own SaaS billing (a separate, later phase) — see
  // the plan file's currency scope boundary.
  const currency = 'USD';

  return {
    merchant_id: getPayHereConfig().merchantId,
    return_url: opts.returnUrl,
    cancel_url: opts.cancelUrl,
    notify_url: opts.notifyUrl,
    order_id: invoice._id.toString(),
    items: `Invoice ${invoice.invoiceNumber}`,
    currency,
    amount,
    first_name: firstName || 'Customer',
    last_name: lastName || 'Customer',
    email: customer.email,
    phone: customer.phone || '0000000000',
    address: 'N/A',
    city: 'Colombo',
    country: 'Sri Lanka',
    hash: generateCheckoutHash(invoice._id.toString(), invoice.balance, currency),
  };
}

/**
 * Builds the PayHere Recurring API form fields for a tenant subscribing to
 * (or switching to) a Starter/Professional plan — Griptor's own SaaS
 * billing, real LKR amounts. `recurrence`/`duration` are the two fields
 * that make this a Recurring checkout instead of a one-time payment;
 * there's no free-trial equivalent to set here (see this phase's plan doc)
 * — PayHere charges immediately on authorization, so this is only ever
 * called once a real charge should actually happen (trial ending, or an
 * explicit early upgrade).
 *
 * order_id is unique PER ATTEMPT (timestamp-suffixed), not per client —
 * a tenant might cancel and retry, and each attempt needs its own PayHere
 * order_id. The notify callback recovers the clientId via
 * parsePlanOrderClientId(), not a database lookup by order_id.
 */
export function buildPlanCheckoutFields(
  client: ClientDoc,
  plan: 'Starter' | 'Professional',
  opts: { returnUrl: string; cancelUrl: string; notifyUrl: string }
): Record<string, string> {
  const [firstName, ...rest] = client.contact.trim().split(/\s+/);
  const lastName = rest.join(' ') || firstName;
  const price = getPlanPriceLkr(plan);
  const amount = formatPayHereAmount(price);
  const currency = 'LKR';
  const orderId = `${PLAN_ORDER_PREFIX}${client._id.toString()}_${Date.now()}`;

  return {
    merchant_id: getPayHereConfig().merchantId,
    return_url: opts.returnUrl,
    cancel_url: opts.cancelUrl,
    notify_url: opts.notifyUrl,
    order_id: orderId,
    items: `Griptor ${plan} plan`,
    currency,
    amount,
    recurrence: '1 Month',
    duration: 'Forever',
    first_name: firstName || client.name,
    last_name: lastName || client.name,
    email: client.email,
    phone: '0000000000',
    address: 'N/A',
    city: 'Colombo',
    country: 'Sri Lanka',
    hash: generateCheckoutHash(orderId, price, currency),
  };
}
