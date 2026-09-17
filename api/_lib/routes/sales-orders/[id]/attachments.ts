import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SalesOrder } from '../../../models/SalesOrder.js';
import { handleAttachmentsRequest } from '../../../salesAttachmentsRoute.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleAttachmentsRequest(req, res, { permission: 'sales:manage', model: SalesOrder, notFoundMessage: 'Sales order not found' });
}
