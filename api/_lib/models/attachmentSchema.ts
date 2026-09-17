import { Schema } from 'mongoose';

// Sales Module Phase 16 — shared by Quotation/SalesOrder/CustomerInvoice/
// Return, the 4 documents this phase attaches files to (a signed PO, a
// delivery photo, a payment slip). The actual bytes never touch this app's
// own server — they're uploaded directly from the browser to Vercel Blob
// (see routes/sales-attachments/upload-token.ts and
// src/lib/salesAttachmentUpload.ts), the exact same pattern Inspection.ts's
// `media` array already established; this only ever stores the resulting
// URL plus display metadata, same as that array.
export const AttachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    name: { type: String, required: true },
    contentType: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);
