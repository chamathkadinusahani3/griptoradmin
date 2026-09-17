import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SalespersonAssignment, SalespersonAssignmentDoc, VISIT_FREQUENCIES, ASSIGNMENT_PRIORITIES, VISIT_DAYS } from '../../models/SalespersonAssignment.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { RouteModel, RouteDoc } from '../../models/Route.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeSalespersonAssignment } from '../../serializers.js';

interface UpdateAssignmentBody {
  territory?: string;
  routeId?: string | null;
  visitFrequency?: (typeof VISIT_FREQUENCIES)[number];
  preferredVisitDay?: (typeof VISIT_DAYS)[number];
  priority?: (typeof ASSIGNMENT_PRIORITIES)[number];
  active?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'PATCH') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-assignments:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing assignment id' });

  const body = (req.body ?? {}) as UpdateAssignmentBody;
  if (body.visitFrequency && !VISIT_FREQUENCIES.includes(body.visitFrequency)) return res.status(400).json({ error: 'Invalid visitFrequency' });
  if (body.priority && !ASSIGNMENT_PRIORITIES.includes(body.priority)) return res.status(400).json({ error: 'Invalid priority' });
  if (body.preferredVisitDay && !VISIT_DAYS.includes(body.preferredVisitDay)) return res.status(400).json({ error: 'Invalid preferredVisitDay' });

  await connectToDatabase();

  if (body.routeId) {
    const route = await RouteModel.findOne({ _id: body.routeId, clientId: session.clientId }).lean();
    if (!route) return res.status(400).json({ error: 'Route not found' });
  }

  const update: Record<string, unknown> = {};
  if (body.territory !== undefined) update.territory = body.territory;
  if (body.routeId !== undefined) update.routeId = body.routeId || undefined;
  if (body.visitFrequency !== undefined) update.visitFrequency = body.visitFrequency;
  if (body.preferredVisitDay !== undefined) update.preferredVisitDay = body.preferredVisitDay;
  if (body.priority !== undefined) update.priority = body.priority;
  if (body.active !== undefined) update.active = body.active;

  const assignment = (await SalespersonAssignment.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as SalespersonAssignmentDoc | null;
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

  const [salesperson, customer, route] = await Promise.all([
    Salesperson.findOne({ _id: assignment.salespersonId, clientId: session.clientId }).lean() as Promise<SalespersonDoc | null>,
    Customer.findOne({ _id: assignment.customerId, clientId: session.clientId }).lean() as Promise<CustomerDoc | null>,
    assignment.routeId ? (RouteModel.findOne({ _id: assignment.routeId, clientId: session.clientId }).lean() as Promise<RouteDoc | null>) : null,
  ]);

  return res.status(200).json({
    assignment: serializeSalespersonAssignment(assignment, {
      salespersonName: salesperson?.name,
      salespersonCode: salesperson?.code,
      customerName: customer?.name,
      routeName: route?.name,
    }),
  });
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-assignments:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing assignment id' });

  await connectToDatabase();
  const deleted = await SalespersonAssignment.findOneAndDelete({ _id: id, clientId: session.clientId }).lean();
  if (!deleted) return res.status(404).json({ error: 'Assignment not found' });

  return res.status(204).end();
}
