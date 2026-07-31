import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { MessageTemplate, MessageTemplateDoc } from '../../models/MessageTemplate.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeMessageTemplate } from '../../serializers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'message-templates:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing template id' });

  await connectToDatabase();

  if (req.method === 'PATCH') {
    const existing = await MessageTemplate.findOne({ _id: id, clientId: session.clientId }).lean();
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    const { name, body } = (req.body ?? {}) as { name?: string; body?: string };
    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name;
    if (body !== undefined) update.body = body;

    const template = (await MessageTemplate.findOneAndUpdate(
      { _id: id, clientId: session.clientId },
      update,
      { returnDocument: 'after' }
    ).lean()) as MessageTemplateDoc;
    return res.status(200).json({ template: serializeMessageTemplate(template) });
  }

  if (req.method === 'DELETE') {
    const deleted = await MessageTemplate.findOneAndDelete({ _id: id, clientId: session.clientId }).lean();
    if (!deleted) return res.status(404).json({ error: 'Template not found' });
    return res.status(204).end();
  }

  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
