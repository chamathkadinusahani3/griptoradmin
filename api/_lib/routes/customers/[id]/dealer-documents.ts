import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { DealerProfile, DealerProfileDoc, DEALER_DOCUMENT_TYPES } from '../../../models/DealerProfile.js';
import { requireTenantPermission } from '../../../auth.js';
import { serializeDealerProfile } from '../../../serializers.js';

interface UploadDocumentBody {
  documentType?: (typeof DEALER_DOCUMENT_TYPES)[number];
  url?: string;
  name?: string;
  contentType?: string;
  size?: number;
}

// Customer/Dealer Registration roadmap Phase 3 — a typed-slot document list
// (one attachment per documentType, replacing the same slot on re-upload),
// distinct from handleAttachmentsRequest's flat undifferentiated array used
// by Quotation/SalesOrder/CustomerInvoice/Return, since a credit
// application specifically needs to know WHICH required document is
// present vs. still missing. Reuses the EXISTING sales-attachments Vercel
// Blob upload-token endpoint (salesAttachmentUpload.ts's allow-list now
// includes 'dealer-documents') rather than a new upload endpoint.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'customers:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing customer id' });

  await connectToDatabase();

  const profile = (await DealerProfile.findOne({ clientId: session.clientId, customerId: id })) as InstanceType<typeof DealerProfile> | null;
  if (!profile) return res.status(404).json({ error: 'Dealer profile not found' });

  if (req.method === 'POST') {
    const { documentType, url, name, contentType, size } = (req.body ?? {}) as UploadDocumentBody;
    if (!documentType || !(DEALER_DOCUMENT_TYPES as readonly string[]).includes(documentType)) {
      return res.status(400).json({ error: 'Invalid documentType' });
    }
    if (!url?.trim() || !name?.trim()) return res.status(400).json({ error: 'url and name are required' });

    const documents = (profile.documents ?? []).filter((d: { documentType: string }) => d.documentType !== documentType);
    documents.push({ documentType, attachment: { url: url.trim(), name: name.trim(), contentType, size, uploadedAt: new Date() } });
    profile.documents = documents;
    await profile.save();
  } else {
    const documentType = typeof req.query.documentType === 'string' ? req.query.documentType : undefined;
    if (!documentType) return res.status(400).json({ error: 'documentType is required' });
    profile.documents = (profile.documents ?? []).filter((d: { documentType: string }) => d.documentType !== documentType);
    await profile.save();
  }

  return res.status(200).json({ dealerProfile: serializeDealerProfile(profile.toObject() as DealerProfileDoc) });
}
