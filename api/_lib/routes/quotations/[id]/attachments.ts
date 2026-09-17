import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Quotation } from '../../../models/Quotation.js';
import { handleAttachmentsRequest } from '../../../salesAttachmentsRoute.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleAttachmentsRequest(req, res, { permission: 'quotations:manage', model: Quotation, notFoundMessage: 'Quotation not found' });
}
