import { upload } from '@vercel/blob/client';

export type SalesAttachmentDocType = 'quotations' | 'sales-orders' | 'customer-invoices' | 'returns' | 'dealer-documents';

export interface UploadedAttachment {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

/**
 * Uploads a sales-document attachment (a signed PO, a delivery photo, a
 * payment slip) directly from the browser to Vercel Blob — same
 * direct-upload pattern as inspectionUpload.ts, just without that helper's
 * image-only compression step, since these are as often a PDF scan as a
 * photo.
 */
export async function uploadSalesAttachment(clientId: string, docType: SalesAttachmentDocType, file: File): Promise<UploadedAttachment> {
  const pathname = `sales-attachments/${clientId}/${docType}/${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;

  const result = await upload(pathname, file, {
    access: 'public',
    handleUploadUrl: '/api/sales-attachments/upload-token',
  });

  return { url: result.url, name: file.name, contentType: file.type || 'application/octet-stream', size: file.size };
}
