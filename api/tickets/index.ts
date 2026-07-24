import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Ticket, TicketDoc } from '../_lib/models/Ticket';
import { Client, ClientDoc } from '../_lib/models/Client';
import { requireAuth } from '../_lib/auth';
import { serializeTicket } from '../_lib/serializers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAuth(req, res, 'super')) return;

  await connectToDatabase();

  const { clientId } = req.query;
  const filter = typeof clientId === 'string' ? { clientId } : {};

  const tickets = (await Ticket.find(filter).sort({ updatedAt: -1 }).lean()) as TicketDoc[];
  const clients = (await Client.find().lean()) as ClientDoc[];
  const nameById = new Map(clients.map((c) => [c._id.toString(), c.name]));

  return res.status(200).json({
    tickets: tickets.map((t) => serializeTicket(t, nameById.get(t.clientId.toString()))),
  });
}
