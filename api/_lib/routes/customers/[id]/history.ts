import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Customer, CustomerDoc } from '../../../models/Customer.js';
import { Vehicle, VehicleDoc } from '../../../models/Vehicle.js';
import { JobCard, JobCardDoc } from '../../../models/JobCard.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../../models/CustomerInvoice.js';
import { Complaint, ComplaintDoc } from '../../../models/Complaint.js';
import { CallLog, CallLogDoc } from '../../../models/CallLog.js';
import { requireTenantPermission } from '../../../auth.js';

type TimelineEventType = 'job-card' | 'invoice' | 'complaint' | 'call-log';

interface TimelineEvent {
  type: TimelineEventType;
  id: string;
  date: Date;
  title: string;
  status: string;
  detail?: string;
}

// The unified view statement.ts (financial-only, feeding CorporateAccounts.tsx's
// credit statement) never was — stitches every other customer-facing record
// into one chronological timeline. Deliberately a NEW route rather than
// extending statement.ts itself: that endpoint has a specific, narrower
// shape real callers already depend on (credit limit/overdue/dealer
// metrics), and widening it risks breaking that rather than serving this.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'customers:view');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing customer id' });

  await connectToDatabase();

  const customer = (await Customer.findOne({ _id: id, clientId: session.clientId }).lean()) as CustomerDoc | null;
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const [vehicles, jobCards, invoices, complaints, callLogs] = await Promise.all([
    Vehicle.find({ clientId: session.clientId, customerId: id }).lean() as Promise<VehicleDoc[]>,
    JobCard.find({ clientId: session.clientId, customerId: id }).lean() as Promise<JobCardDoc[]>,
    CustomerInvoice.find({ clientId: session.clientId, customerId: id }).lean() as Promise<CustomerInvoiceDoc[]>,
    Complaint.find({ clientId: session.clientId, customerId: id }).lean() as Promise<ComplaintDoc[]>,
    CallLog.find({ clientId: session.clientId, customerId: id }).lean() as Promise<CallLogDoc[]>,
  ]);

  const events: TimelineEvent[] = [
    ...jobCards.map((j) => ({
      type: 'job-card' as const,
      id: j._id.toString(),
      date: (j as unknown as { createdAt: Date }).createdAt,
      title: `Job card — ${j.vehicle}`,
      status: j.status,
    })),
    ...invoices.map((inv) => ({
      type: 'invoice' as const,
      id: inv._id.toString(),
      date: (inv as unknown as { createdAt: Date }).createdAt,
      title: `Invoice ${inv.invoiceNumber}`,
      status: inv.paymentStatus,
      detail: `${inv.total}`,
    })),
    ...complaints.map((c) => ({
      type: 'complaint' as const,
      id: c._id.toString(),
      date: (c as unknown as { createdAt: Date }).createdAt,
      title: `Complaint — ${c.category}`,
      status: c.status,
      detail: c.priority,
    })),
    ...callLogs.map((c) => ({
      type: 'call-log' as const,
      id: c._id.toString(),
      date: (c as unknown as { createdAt: Date }).createdAt,
      title: `${c.direction} call — ${c.reason}`,
      status: c.status,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return res.status(200).json({
    vehicles: vehicles.map((v) => ({ id: v._id.toString(), label: v.label, plate: v.plate, make: v.make, model: v.model, year: v.year })),
    timeline: events,
    summary: {
      jobCardCount: jobCards.length,
      invoiceCount: invoices.length,
      complaintCount: complaints.length,
      callLogCount: callLogs.length,
    },
  });
}
