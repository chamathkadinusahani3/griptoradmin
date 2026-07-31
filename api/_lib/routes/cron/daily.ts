import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Client, ClientDoc } from '../../models/Client.js';
import { Part, PartDoc } from '../../models/Part.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { SmsLog } from '../../models/SmsLog.js';
import { sendSms } from '../../notifylk.js';
import { getCustomerInvoicesAndTotals, computeDealerMetrics } from '../../dealerMetrics.js';

interface RunSummary {
  lowStockAlertsSent: number;
  dealerReportsSent: number;
  errors: string[];
}

export async function runLowStockScan(client: ClientDoc, summary: RunSummary, now: Date) {
  const parts = (await Part.find({ clientId: client._id }).lean()) as PartDoc[];
  const newlyLow: PartDoc[] = [];
  const bulkOps: Array<{ updateOne: { filter: { _id: unknown }; update: Record<string, unknown> } }> = [];

  for (const part of parts) {
    const low = part.stock <= part.reorderAt;
    if (low && !part.lowStockAlertActive) {
      newlyLow.push(part);
      bulkOps.push({ updateOne: { filter: { _id: part._id }, update: { lowStockAlertActive: true, lastAlertedAt: now } } });
    } else if (!low && part.lowStockAlertActive) {
      bulkOps.push({ updateOne: { filter: { _id: part._id }, update: { lowStockAlertActive: false } } });
    }
  }

  if (bulkOps.length > 0) await Part.bulkWrite(bulkOps);
  if (newlyLow.length === 0) return;

  const names = newlyLow.slice(0, 5).map((p) => p.name);
  const extra = newlyLow.length > 5 ? `, +${newlyLow.length - 5} more` : '';
  const message = `Low stock alert: ${names.join(', ')}${extra} at or below reorder point. Please restock soon.`;

  if (!client.alertsPhone) {
    // SmsLog.to is required (non-empty) — there's no real recipient to log
    // here, so use a sentinel rather than failing schema validation.
    await SmsLog.create({ clientId: client._id, to: 'unconfigured', message, sent: false, error: 'No alerts phone configured', source: 'low-stock-alert', partId: newlyLow[0]._id });
    return;
  }

  const result = await sendSms(client, client.alertsPhone, message);
  await SmsLog.create({ clientId: client._id, to: client.alertsPhone, message, sent: result.sent, error: result.error, source: 'low-stock-alert', partId: newlyLow[0]._id });
  if (result.sent) summary.lowStockAlertsSent++;
}

export async function runDealerOutstandingReport(client: ClientDoc, summary: RunSummary, now: Date) {
  const dealers = (await Customer.find({ clientId: client._id, type: 'corporate' }).lean()) as CustomerDoc[];

  for (const dealer of dealers) {
    const { invoices, totalOutstanding, overdueAmount } = await getCustomerInvoicesAndTotals(client._id.toString(), dealer._id.toString(), now);
    if (totalOutstanding <= 0) continue;

    const metrics = computeDealerMetrics(invoices, dealer.creditLimit ?? 0, totalOutstanding, dealer.creditPeriodDays ?? 30, now);
    let message = `${client.name}: Outstanding balance ${totalOutstanding.toFixed(2)}, overdue ${overdueAmount.toFixed(2)}.`;
    if (metrics.isInViolation) {
      message += ` Your account has exceeded its approved ${dealer.creditPeriodDays ?? 30}-day credit period; your discount is suspended until settled.`;
    }

    if (!dealer.phone) {
      await SmsLog.create({ clientId: client._id, customerId: dealer._id, to: 'unconfigured', message, sent: false, error: 'Dealer has no phone number', source: 'dealer-outstanding-report' });
      continue;
    }

    const result = await sendSms(client, dealer.phone, message);
    await SmsLog.create({ clientId: client._id, customerId: dealer._id, to: dealer.phone, message, sent: result.sent, error: result.error, source: 'dealer-outstanding-report' });
    if (result.sent) summary.dealerReportsSent++;
  }
}

// The single daily scheduled job for this app (Vercel Hobby: max once/day,
// see vercel.json's `crons`). Does two unrelated things in one run purely
// because that's the only cadence available — low-stock scanning runs every
// day, the dealer-outstanding report only fires on Saturdays (isSaturday).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Fail closed if CRON_SECRET itself isn't configured — otherwise the
  // comparison target becomes the literal, guessable string "Bearer
  // undefined" and anyone could authenticate as the cron.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  await connectToDatabase();
  const now = new Date();
  const isSaturday = now.getDay() === 6;
  const clients = (await Client.find({ status: { $in: ['Active', 'Trial'] } }).lean()) as ClientDoc[];

  const summary: RunSummary = { lowStockAlertsSent: 0, dealerReportsSent: 0, errors: [] };
  for (const client of clients) {
    try {
      await runLowStockScan(client, summary, now);
      if (isSaturday) await runDealerOutstandingReport(client, summary, now);
    } catch (err) {
      summary.errors.push(`${client._id}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  return res.status(200).json({ ok: true, ranAt: now.toISOString(), isSaturday, ...summary });
}
