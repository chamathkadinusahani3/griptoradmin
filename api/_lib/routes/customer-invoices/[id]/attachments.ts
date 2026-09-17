import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CustomerInvoice } from '../../../models/CustomerInvoice.js';
import { handleAttachmentsRequest } from '../../../salesAttachmentsRoute.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleAttachmentsRequest(req, res, { permission: 'customer-invoices:manage', model: CustomerInvoice, notFoundMessage: 'Invoice not found' });
}
