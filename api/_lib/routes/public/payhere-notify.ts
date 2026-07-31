import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../db.js';
import { verifyNotificationSignature, parsePlanOrderClientId } from '../../payhere.js';
import { recordCustomerInvoicePayment, hasGatewayPaymentBeenRecorded } from '../../customerInvoicePayments.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { Client } from '../../models/Client.js';
import { Invoice } from '../../models/Invoice.js';

interface PayHereNotifyBody {
  merchant_id?: string;
  order_id?: string;
  payment_id?: string;
  payhere_amount?: string;
  payhere_currency?: string;
  status_code?: string;
  md5sig?: string;
  // Recurring-payment-specific fields (PLAN_ orders only) — absent on a
  // one-time CustomerInvoice payment notification.
  message_type?: string;
  subscription_id?: string;
}

// Public, unauthenticated — PayHere itself is the caller. Authenticated
// instead via md5sig verification against the shared merchant_secret
// (verifyNotificationSignature). Unlike the earlier Stripe webhook, PayHere
// POSTs standard application/x-www-form-urlencoded data, which Vercel's
// default body parser already handles fine — no raw-body/config.bodyParser
// trick needed here.
//
// Handles TWO independent money flows, distinguished by order_id shape:
//   1. A garage customer paying a CustomerInvoice (order_id = the invoice's
//      own Mongo id) — this is the authoritative source of truth for
//      marking it paid; the public thank-you page a customer lands on is
//      UX only, never trusted.
//   2. A tenant paying Griptor for their own plan (order_id = "PLAN_<clientId>_<ts>",
//      api/tenant/setup-payment.ts) — real recurring subscription billing.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = (req.body ?? {}) as PayHereNotifyBody;
  const { merchant_id, order_id, payment_id, payhere_amount, payhere_currency, status_code, md5sig, message_type, subscription_id } = body;

  if (!merchant_id || !order_id || !payhere_amount || !payhere_currency || !status_code || !md5sig) {
    // Missing fields — nothing we can verify or act on. Still 200: this is
    // either malformed noise or a PayHere event type with a different
    // payload shape than the payment notification we handle here, and a
    // non-2xx would just trigger pointless PayHere retries.
    return res.status(200).json({ received: true });
  }

  const validSignature = verifyNotificationSignature({ merchant_id, order_id, payhere_amount, payhere_currency, status_code, md5sig });
  if (!validSignature) {
    // Deliberately silent — do not reveal via status code whether this
    // "looked close" to valid. Just don't act on it.
    return res.status(200).json({ received: true });
  }

  await connectToDatabase();

  // --- Flow 2: Griptor's own tenant plan billing ---
  const planClientId = parsePlanOrderClientId(order_id);
  if (planClientId) {
    if (status_code === '2' && payment_id) {
      const alreadyRecorded = await Invoice.findOne({ payherePaymentId: payment_id }).lean();
      if (!alreadyRecorded) {
        const client = await Client.findById(planClientId).lean();
        if (client) {
          await Invoice.create({
            clientId: planClientId,
            plan: (client as { plan: string }).plan,
            amount: Number(payhere_amount),
            status: 'Paid',
            payherePaymentId: payment_id,
          });
        }
      }
      // Covers both the first AUTHORIZATION_SUCCESS and every subsequent
      // RECURRING_INSTALLMENT_SUCCESS the same way — always real-activate
      // and keep mrr in sync with the actual charged amount. subscription_id
      // is only ever re-set here (harmless to repeat on every charge, PayHere
      // always echoes the same one for a given subscription).
      const update: Record<string, unknown> = { status: 'Active', mrr: Number(payhere_amount) };
      if (subscription_id) update.payhereSubscriptionId = subscription_id;
      await Client.updateOne({ _id: planClientId }, update);
    } else if (status_code !== '2' && payment_id) {
      // A failed/pending/cancelled recurring attempt — record it, don't
      // suspend (same "let it retry, don't panic on one failure" posture
      // Phase B originally chose for Stripe). NOTE: PayHere's exact
      // recurring-failure notification shape wasn't fully confirmed from
      // available docs at build time — this is a best-effort handling,
      // worth re-checking once real sandbox recurring failures are observed.
      const alreadyRecorded = await Invoice.findOne({ payherePaymentId: payment_id }).lean();
      if (!alreadyRecorded) {
        const client = await Client.findById(planClientId).lean();
        if (client) {
          await Invoice.create({
            clientId: planClientId,
            plan: (client as { plan: string }).plan,
            amount: Number(payhere_amount),
            status: 'Failed',
            payherePaymentId: payment_id,
          });
        }
      }
    }
    return res.status(200).json({ received: true });
  }

  // --- Flow 1: a garage customer paying their own CustomerInvoice ---
  // status_code '2' = Success (PayHere's documented codes: 2=Success,
  // 0=Pending, -1=Canceled, -2=Failed, -3=Chargedback). Only a real success
  // ever records a payment.
  if (status_code === '2' && payment_id && mongoose.Types.ObjectId.isValid(order_id)) {
    const invoice = (await CustomerInvoice.findById(order_id).lean()) as CustomerInvoiceDoc | null;
    if (invoice) {
      const alreadyRecorded = await hasGatewayPaymentBeenRecorded(order_id, invoice.clientId.toString(), payment_id);
      if (!alreadyRecorded) {
        await recordCustomerInvoicePayment(order_id, invoice.clientId.toString(), {
          amount: Number(payhere_amount),
          method: 'PayHere',
          payherePaymentId: payment_id,
        });
      }
    }
  }

  return res.status(200).json({ received: true });
}
