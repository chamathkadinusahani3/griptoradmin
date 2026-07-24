import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { Ticket, TicketDoc } from '../_lib/models/Ticket';
import { Client, ClientDoc } from '../_lib/models/Client';
import { User, UserDoc } from '../_lib/models/User';
import { requireAuth } from '../_lib/auth';
import { serializeTicket } from '../_lib/serializers';

interface UpdateTicketBody {
  status?: 'Open' | 'Pending' | 'Resolved';
  reply?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireAuth(req, res, 'super');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing ticket id' });

  const { status, reply } = (req.body ?? {}) as UpdateTicketBody;
  if (!status && !reply) return res.status(400).json({ error: 'status or reply is required' });

  await connectToDatabase();

  let update: Record<string, unknown>;
  if (reply) {
    const agent = (await User.findById(session.sub).lean()) as UserDoc | null;
    update = {
      $push: { thread: { author: agent?.name ?? 'Agent', role: 'agent', text: reply, time: new Date() } },
      $set: { status: status ?? 'Pending' },
    };
  } else {
    update = { $set: { status } };
  }

  const ticket = (await Ticket.findByIdAndUpdate(id, update, { returnDocument: 'after' }).lean()) as TicketDoc | null;
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const client = (await Client.findById(ticket.clientId).lean()) as ClientDoc | null;
  return res.status(200).json({ ticket: serializeTicket(ticket, client?.name) });
}
