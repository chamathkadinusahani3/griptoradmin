import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Return } from '../../../models/Return.js';
import { handleAttachmentsRequest } from '../../../salesAttachmentsRoute.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleAttachmentsRequest(req, res, { permission: 'returns:manage', model: Return, notFoundMessage: 'Return not found' });
}
