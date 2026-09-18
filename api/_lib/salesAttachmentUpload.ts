// 'dealer-documents' (Customer/Dealer Registration roadmap Phase 3) reuses
// this same upload-token endpoint and content-type/size policy for a
// dealer's credit-application documents (business registration, TIN/VAT
// certificates, owner NIC, bank statements) — deliberately not a new
// endpoint, just one more allowed path segment.
export const SALES_ATTACHMENT_DOC_TYPES = ['quotations', 'sales-orders', 'customer-invoices', 'returns', 'dealer-documents'] as const;
export type SalesAttachmentDocType = (typeof SALES_ATTACHMENT_DOC_TYPES)[number];

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/**
 * Sales Module Phase 16 — the tenant-scoping + content-type/size policy for
 * a sales-document attachment upload, extracted as a pure function (no
 * Vercel Blob SDK call) so it's directly unit-testable without a real
 * BLOB_READ_WRITE_TOKEN — routes/sales-attachments/upload-token.ts's
 * onBeforeGenerateToken just calls this and throws on a null result. Every
 * upload must live under sales-attachments/<clientId>/<docType>/ — the
 * client's claimed pathname is never trusted beyond that prefix, same
 * discipline as inspections/upload-token.ts.
 */
export function resolveAttachmentUploadOptions(
  pathname: string,
  clientId: string
): { allowedContentTypes: string[]; maximumSizeInBytes: number } | null {
  const prefix = `sales-attachments/${clientId}/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const docType = rest.split('/')[0];
  if (!(SALES_ATTACHMENT_DOC_TYPES as readonly string[]).includes(docType)) return null;
  return { allowedContentTypes: ALLOWED_CONTENT_TYPES, maximumSizeInBytes: MAX_ATTACHMENT_BYTES };
}
