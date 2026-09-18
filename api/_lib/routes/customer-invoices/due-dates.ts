import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Employee, EmployeeDoc } from '../../models/Employee.js';
import { Salesperson, SalespersonDoc } from '../../models/Salesperson.js';
import { SalespersonAssignment, SalespersonAssignmentDoc } from '../../models/SalespersonAssignment.js';
import { requireTenantPermission } from '../../auth.js';

// Dealer Credit Control roadmap Module 5, Phase 5.3 — feeds the
// DueDateCalendar component with every OUTSTANDING invoice's due date,
// scoped per the logged-in user: a Sales Rep (resolved via the same
// session -> Employee -> Salesperson chain as salespersons/me/dealers.ts)
// sees only their own assigned dealers' due dates; anyone else (Accounts,
// Owner, Manager — no linked Salesperson) sees every dealer tenant-wide,
// matching the spec's own "Sales Rep vs Accounts" split.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'customer-invoices:view');
  if (!session) return;

  await connectToDatabase();

  const employee = (await Employee.findOne({ clientId: session.clientId, userId: session.sub }).lean()) as EmployeeDoc | null;
  const salesperson = employee
    ? ((await Salesperson.findOne({ clientId: session.clientId, employeeId: employee._id }).lean()) as SalespersonDoc | null)
    : null;

  const invoiceFilter: Record<string, unknown> = {
    clientId: session.clientId,
    status: { $ne: 'Void' },
    balance: { $gt: 0 },
    dueDate: { $ne: null },
  };

  if (salesperson) {
    const assignments = (await SalespersonAssignment.find({
      clientId: session.clientId,
      salespersonId: salesperson._id,
      active: true,
    })
      .select('customerId')
      .lean()) as SalespersonAssignmentDoc[];
    invoiceFilter.customerId = { $in: assignments.map((a) => a.customerId) };
  }

  const invoices = (await CustomerInvoice.find(invoiceFilter).select('invoiceNumber customerId dueDate balance').lean()) as CustomerInvoiceDoc[];
  const customerIds = [...new Set(invoices.map((i) => i.customerId.toString()))];
  const customers = customerIds.length > 0 ? ((await Customer.find({ _id: { $in: customerIds } }).select('name').lean()) as CustomerDoc[]) : [];
  const customerNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));

  return res.status(200).json({
    scope: salesperson ? 'mine' : 'all',
    dueDates: invoices.map((inv) => ({
      date: inv.dueDate,
      invoiceId: inv._id.toString(),
      invoiceNumber: inv.invoiceNumber,
      customerId: inv.customerId.toString(),
      customerName: customerNameById.get(inv.customerId.toString()),
      amount: inv.balance,
    })),
  });
}
