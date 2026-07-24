import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { MessageTemplate, MessageTemplateDoc } from '../_lib/models/MessageTemplate';
import { requireTenant } from '../_lib/auth';
import { serializeMessageTemplate } from '../_lib/serializers';

interface CreateTemplateBody {
  name?: string;
  body?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = requireTenant(req, res);
  if (!session) return;

  await connectToDatabase();
  const templates = (await MessageTemplate.find({ clientId: session.clientId }).sort({ name: 1 }).lean()) as MessageTemplateDoc[];
  return res.status(200).json({ templates: templates.map(serializeMessageTemplate) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = requireTenant(req, res);
  if (!session) return;

  const { name, body } = (req.body ?? {}) as CreateTemplateBody;
  if (!name || !body) return res.status(400).json({ error: 'name and body are required' });

  await connectToDatabase();
  const template = await MessageTemplate.create({ clientId: session.clientId, name, body });

  return res.status(201).json({ template: serializeMessageTemplate(template.toObject()) });
}
