import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireTenant } from '../../auth.js';
import { resolveAttachmentUploadOptions } from '../../salesAttachmentUpload.js';

// Sales Module Phase 16 — shared by Quotation/SalesOrder/CustomerInvoice/
// Return attachments (a signed PO, a delivery photo, a payment slip), same
// direct-to-Vercel-Blob pattern as inspections/upload-token.ts. Gated by
// requireTenant (any authenticated staff) rather than one document's own
// :manage permission, since this single endpoint serves four different
// document types each with their own permission — the actual authority
// check happens where the resulting URL gets attached to a specific
// document (routes/<doc>/[id]/attachments.ts), not here.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  try {
    const jsonResponse = await handleUpload({
      body: req.body as HandleUploadBody,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const options = resolveAttachmentUploadOptions(pathname, session.clientId);
        if (!options) throw new Error('Invalid upload path');
        return { ...options, addRandomSuffix: true };
      },
    });
    return res.status(200).json(jsonResponse);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload token generation failed' });
  }
}
