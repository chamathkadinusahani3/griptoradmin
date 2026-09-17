import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Salesperson, SalespersonDoc } from '../../../models/Salesperson.js';
import { Employee, EmployeeDoc } from '../../../models/Employee.js';
import { SalespersonAssignment, SalespersonAssignmentDoc } from '../../../models/SalespersonAssignment.js';
import { Customer, CustomerDoc } from '../../../models/Customer.js';
import { requireTenant } from '../../../auth.js';
import { computeDealerMetrics, getCustomerInvoicesAndTotals, getCustomerReturnedAmount } from '../../../dealerMetrics.js';
import { CREDIT_ELIGIBLE_CUSTOMER_TYPES } from '../../../creditDiscipline.js';

// Dealer Credit Control roadmap Module 1, Phase 1.1 — self-service "my
// assigned dealers" view. Resolves session.sub (the logged-in User) ->
// Employee.userId -> Salesperson.employeeId, a chain that exists in the
// data model (Salesperson master data + the Employee self-service
// clock-in/out flow) but nothing has traversed before this. Any
// authenticated tenant staff member can call this — it isn't gated behind a
// salespersons:* permission — it just returns salesperson: null if the
// caller isn't a linked Salesperson, the same self-service shape as
// attendance/me.ts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  await connectToDatabase();

  const employee = (await Employee.findOne({ clientId: session.clientId, userId: session.sub }).lean()) as EmployeeDoc | null;
  const salesperson = employee
    ? ((await Salesperson.findOne({ clientId: session.clientId, employeeId: employee._id }).lean()) as SalespersonDoc | null)
    : null;

  if (!salesperson) {
    return res.status(200).json({ salesperson: null, dealers: [] });
  }

  const salespersonSummary = { id: salesperson._id.toString(), name: salesperson.name, code: salesperson.code };

  const assignments = (await SalespersonAssignment.find({
    clientId: session.clientId,
    salespersonId: salesperson._id,
    active: true,
  }).lean()) as SalespersonAssignmentDoc[];
  if (assignments.length === 0) {
    return res.status(200).json({ salesperson: salespersonSummary, dealers: [] });
  }

  const customerIds = assignments.map((a) => a.customerId.toString());
  const customers = (await Customer.find({ _id: { $in: customerIds }, clientId: session.clientId }).lean()) as CustomerDoc[];
  const assignmentByCustomerId = new Map(assignments.map((a) => [a.customerId.toString(), a]));

  const dealers = await Promise.all(
    customers.map(async (customer) => {
      const customerId = customer._id.toString();
      const { invoices, totalOutstanding } = await getCustomerInvoicesAndTotals(session.clientId, customerId);
      const creditLimit = customer.creditLimit ?? 0;
      const metrics = CREDIT_ELIGIBLE_CUSTOMER_TYPES.includes(customer.type as (typeof CREDIT_ELIGIBLE_CUSTOMER_TYPES)[number])
        ? computeDealerMetrics(
            invoices,
            creditLimit,
            totalOutstanding,
            customer.creditPeriodDays ?? 30,
            new Date(),
            await getCustomerReturnedAmount(session.clientId, invoices.map((i) => i._id.toString()))
          )
        : null;
      const assignment = assignmentByCustomerId.get(customerId)!;

      return {
        customerId,
        name: customer.name,
        type: customer.type,
        status: customer.status,
        territory: assignment.territory,
        visitFrequency: assignment.visitFrequency,
        priority: assignment.priority,
        creditLimit,
        totalOutstanding,
        creditUtilizationPct: metrics?.creditUtilizationPct ?? null,
        isInViolation: metrics?.isInViolation ?? false,
        daysPastCreditPeriod: metrics?.daysPastCreditPeriod ?? 0,
        returnRatioPct: metrics?.returnRatioPct ?? null,
      };
    })
  );

  return res.status(200).json({ salesperson: salespersonSummary, dealers });
}
