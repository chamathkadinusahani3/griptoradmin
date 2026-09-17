import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SalesVisit, SalesVisitDoc } from '../../models/SalesVisit.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeSalesVisit } from '../../serializers.js';
import { computeVisitTripMetrics } from '../../tripCalc.js';

interface CreateVisitBody {
  salespersonId?: string;
  customerId?: string;
  assignmentId?: string;
  visitDate?: string;
  purpose?: string;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function withNames(clientId: string, visits: SalesVisitDoc[]) {
  if (visits.length === 0) return [];

  const salespersonIds = [...new Set(visits.map((v) => v.salespersonId.toString()))];
  const customerIds = [...new Set(visits.map((v) => v.customerId.toString()))];

  const [salespersons, customers, tripMetrics] = await Promise.all([
    Salesperson.find({ _id: { $in: salespersonIds }, clientId }).lean() as Promise<SalespersonDoc[]>,
    Customer.find({ _id: { $in: customerIds }, clientId }).lean() as Promise<CustomerDoc[]>,
    computeVisitTripMetrics(clientId, visits),
  ]);
  const spById = new Map(salespersons.map((s) => [s._id.toString(), s]));
  const custById = new Map(customers.map((c) => [c._id.toString(), c]));

  return visits.map((v) =>
    serializeSalesVisit(v, {
      salespersonName: spById.get(v.salespersonId.toString())?.name,
      salespersonCode: spById.get(v.salespersonId.toString())?.code,
      customerName: custById.get(v.customerId.toString())?.name,
      tripDistanceKm: tripMetrics.get(v._id.toString())?.tripDistanceKm ?? null,
      estimatedFuelCost: tripMetrics.get(v._id.toString())?.estimatedFuelCost ?? null,
    })
  );
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-visits:view');
  if (!session) return;

  const { salespersonId, customerId, status } = req.query;

  await connectToDatabase();
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof salespersonId === 'string') filter.salespersonId = salespersonId;
  if (typeof customerId === 'string') filter.customerId = customerId;
  if (typeof status === 'string') filter.status = status;

  const visits = (await SalesVisit.find(filter).sort({ visitDate: 1 }).lean()) as SalesVisitDoc[];
  return res.status(200).json({ visits: await withNames(session.clientId, visits) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'sf-visits:manage');
  if (!session) return;

  const body = (req.body ?? {}) as CreateVisitBody;
  if (!body.salespersonId || !body.customerId || !body.visitDate) {
    return res.status(400).json({ error: 'salespersonId, customerId, and visitDate are required' });
  }
  const visitDate = new Date(body.visitDate);
  if (Number.isNaN(visitDate.getTime())) {
    return res.status(400).json({ error: 'Invalid visitDate' });
  }

  await connectToDatabase();

  const [salesperson, customer] = await Promise.all([
    Salesperson.findOne({ _id: body.salespersonId, clientId: session.clientId }).lean(),
    Customer.findOne({ _id: body.customerId, clientId: session.clientId }).lean(),
  ]);
  if (!salesperson) return res.status(400).json({ error: 'Salesperson not found' });
  if (!customer) return res.status(400).json({ error: 'Customer not found' });

  const visit = await SalesVisit.create({
    clientId: session.clientId,
    salespersonId: body.salespersonId,
    customerId: body.customerId,
    assignmentId: body.assignmentId || undefined,
    visitDate,
    purpose: body.purpose,
    notes: body.notes,
  });

  const [serialized] = await withNames(session.clientId, [visit.toObject()]);
  return res.status(201).json({ visit: serialized });
}
