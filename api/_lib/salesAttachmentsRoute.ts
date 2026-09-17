import type { VercelRequest, VercelResponse } from '@vercel/node';
import type mongoose from 'mongoose';
import { connectToDatabase } from './db.js';
import { requireTenantPermission } from './auth.js';

interface AttachmentInput {
  url?: string;
  name?: string;
  contentType?: string;
  size?: number;
}

/**
 * Sales Module Phase 16 — POST (add) / DELETE (remove, by url) shared
 * across Quotation/SalesOrder/CustomerInvoice/Return's four otherwise-
 * identical [id]/attachments.ts routes, since only the Model and permission
 * actually differ between them. Returns just the updated `attachments`
 * array (not the full serialized document) — that's all a caller adding or
 * removing one attachment actually needs, and avoids requiring each
 * document's own multi-lookup serializer here.
 */
export async function handleAttachmentsRequest(
  req: VercelRequest,
  res: VercelResponse,
  opts: { permission: string; model: mongoose.Model<any>; notFoundMessage: string }
) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, opts.permission);
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing id' });

  await connectToDatabase();

  if (req.method === 'POST') {
    const { url, name, contentType, size } = (req.body ?? {}) as AttachmentInput;
    if (!url?.trim() || !name?.trim()) return res.status(400).json({ error: 'url and name are required' });

    const doc = (await opts.model
      .findOneAndUpdate(
        { _id: id, clientId: session.clientId },
        { $push: { attachments: { url: url.trim(), name: name.trim(), contentType, size, uploadedAt: new Date() } } },
        { returnDocument: 'after' }
      )
      .select('attachments')
      .lean()) as { attachments: unknown[] } | null;
    if (!doc) return res.status(404).json({ error: opts.notFoundMessage });
    return res.status(200).json({ attachments: doc.attachments });
  }

  // DELETE — url comes from the query string, not the body: this app's
  // shared frontend `api.delete()` helper (src/lib/api.ts) never sends a
  // request body.
  const url = typeof req.query.url === 'string' ? req.query.url : undefined;
  if (!url) return res.status(400).json({ error: 'url is required' });

  const doc = (await opts.model
    .findOneAndUpdate({ _id: id, clientId: session.clientId }, { $pull: { attachments: { url } } }, { returnDocument: 'after' })
    .select('attachments')
    .lean()) as { attachments: unknown[] } | null;
  if (!doc) return res.status(404).json({ error: opts.notFoundMessage });
  return res.status(200).json({ attachments: doc.attachments });
}
