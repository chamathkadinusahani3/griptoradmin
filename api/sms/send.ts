import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Client, ClientDoc } from '../_lib/models/Client';
import { Customer, CustomerDoc } from '../_lib/models/Customer';
import { MessageTemplate, MessageTemplateDoc } from '../_lib/models/MessageTemplate';
import { SmsLog } from '../_lib/models/SmsLog';
import { Reminder } from '../_lib/models/Reminder';
import { requireTenant } from '../_lib/auth';
import { sendSms } from '../_lib/notifylk';
import { serializeSmsLog } from '../_lib/serializers';

interface SendBody {
  customerId?: string;
  message?: string;
  templateId?: string;
  reminderId?: string;
}

function fillTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (match, key) => vars[key] ?? match);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  const { customerId, message, templateId, reminderId } = (req.body ?? {}) as SendBody;
  if (!customerId || (!message && !templateId)) {
    return res.status(400).json({ error: 'customerId and either message or templateId are required' });
  }

  await connectToDatabase();

  const customer = (await Customer.findOne({ _id: customerId, clientId: session.clientId }).lean()) as CustomerDoc | null;
  if (!customer || !customer.phone) {
    return res.status(400).json({ error: 'Customer not found or has no phone number on file' });
  }
  const client = (await Client.findById(session.clientId).lean()) as ClientDoc;

  let finalMessage = message ?? '';
  if (templateId) {
    const template = (await MessageTemplate.findOne({ _id: templateId, clientId: session.clientId }).lean()) as MessageTemplateDoc | null;
    if (!template) return res.status(400).json({ error: 'Unknown template' });
    finalMessage = fillTemplate(template.body, { name: customer.name, date: new Date().toLocaleDateString() });
  }

  const result = await sendSms(client, customer.phone, finalMessage);

  const log = await SmsLog.create({
    clientId: session.clientId,
    customerId,
    to: customer.phone,
    message: finalMessage,
    templateId: templateId || undefined,
    sent: result.sent,
    error: result.error,
  });

  if (reminderId) {
    await Reminder.updateOne(
      { _id: reminderId, clientId: session.clientId },
      { status: result.sent ? 'Sent' : 'Failed' }
    );
  }

  // Always 200 here — whether the SMS gateway itself delivered the message
  // is a business-logic outcome (recorded in `sent`/`error`), not an API
  // request error. The request to send was valid and was actually attempted.
  return res.status(200).json({ log: serializeSmsLog(log.toObject(), customer.name), sent: result.sent, error: result.error });
}
