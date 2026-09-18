import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../../db.js';
import { Salesperson, SalespersonDoc } from '../../../models/Salesperson.js';
import { Employee, EmployeeDoc } from '../../../models/Employee.js';
import { SalespersonAssignment, SalespersonAssignmentDoc } from '../../../models/SalespersonAssignment.js';
import { Customer, CustomerDoc } from '../../../models/Customer.js';
import { Cheque } from '../../../models/Cheque.js';
import { requireTenant } from '../../../auth.js';
import { computeDealerMetrics, getCustomerInvoicesAndTotals, getCustomerReturnedAmount, getCustomerReturnedQuantity } from '../../../dealerMetrics.js';
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
      const invoiceIds = invoices.map((i) => i._id.toString());
      const creditLimit = customer.creditLimit ?? 0;

      // Goods-return figures — value, quantity, and (for credit-eligible
      // types only, same scope computeDealerMetrics already uses) the
      // ratio against total invoiced. Computed once here and reused for
      // the ratio calc below rather than a second round-trip.
      const [returnedAmount, returnedQuantity, chequeReturns] = await Promise.all([
        getCustomerReturnedAmount(session.clientId, invoiceIds),
        getCustomerReturnedQuantity(session.clientId, invoiceIds),
        Cheque.find({ clientId: session.clientId, customerId, direction: 'incoming', status: 'Returned' })
          .select('amount')
          .lean() as Promise<{ amount: number }[]>,
      ]);
      const chequeReturnsCount = chequeReturns.length;
      const chequeReturnedAmount = Math.round(chequeReturns.reduce((sum, c) => sum + c.amount, 0) * 100) / 100;

      const metrics = CREDIT_ELIGIBLE_CUSTOMER_TYPES.includes(customer.type as (typeof CREDIT_ELIGIBLE_CUSTOMER_TYPES)[number])
        ? computeDealerMetrics(invoices, creditLimit, totalOutstanding, customer.creditPeriodDays ?? 30, new Date(), returnedAmount)
        : null;
      const assignment = assignmentByCustomerId.get(customerId)!;

      return {
        customerId,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        contactPerson: customer.contactPerson,
        billingAddress: customer.billingAddress,
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
        returnedAmount,
        returnedQuantity,
        chequeReturnsCount,
        chequeReturnedAmount,
      };
    })
  );

  return res.status(200).json({ salesperson: salespersonSummary, dealers });
}
