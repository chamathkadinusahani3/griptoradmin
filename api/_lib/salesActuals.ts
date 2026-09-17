import { SalesOrder, SalesOrderDoc } from './models/SalesOrder.js';
import { CustomerInvoice, CustomerInvoiceDoc } from './models/CustomerInvoice.js';

/**
 * Actual sales attributed to one salesperson within a date range — summed
 * from SalesOrder + CustomerInvoice totals whose salespersonId matches
 * (SF-Phase 6's attribution). Excludes Cancelled orders / Void invoices,
 * same convention as every other report in this codebase. Deliberately
 * does NOT include `Sale` (POS/fulfillment) records — those aren't
 * attributed to a salesperson in this phase; see SalesOrder/CustomerInvoice
 * model comments for the exact scope boundary.
 */
export async function computeActualSales(clientId: string, salespersonId: string, from: Date, to: Date): Promise<number> {
  const [orders, invoices] = await Promise.all([
    SalesOrder.find({
      clientId,
      salespersonId,
      // 'Pending Approval' orders (ERP-Phase 2) aren't a committed sale yet
      // — excluded the same way Cancelled already was, so a gated tenant's
      // achievement% doesn't count orders nobody has approved.
      status: { $nin: ['Cancelled', 'Pending Approval'] },
      createdAt: { $gte: from, $lte: to },
    }).lean() as Promise<SalesOrderDoc[]>,
    CustomerInvoice.find({
      clientId,
      salespersonId,
      status: { $ne: 'Void' },
      createdAt: { $gte: from, $lte: to },
    }).lean() as Promise<CustomerInvoiceDoc[]>,
  ]);

  const orderTotal = orders.reduce((sum, o) => sum + o.total, 0);
  const invoiceTotal = invoices.reduce((sum, inv) => sum + inv.total, 0);
  return orderTotal + invoiceTotal;
}
