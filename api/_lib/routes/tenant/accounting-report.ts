import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Quotation, QuotationDoc } from '../../models/Quotation.js';
import { CustomerInvoice, CustomerInvoiceDoc } from '../../models/CustomerInvoice.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  const { from, to } = resolveReportRange(req);
  await connectToDatabase();

  const [quotations, invoices] = await Promise.all([
    Quotation.find({ clientId: session.clientId, createdAt: { $gte: from, $lte: to } }).lean() as Promise<QuotationDoc[]>,
    CustomerInvoice.find({ clientId: session.clientId, status: { $ne: 'Void' }, createdAt: { $gte: from, $lte: to } }).lean() as Promise<
      CustomerInvoiceDoc[]
    >,
  ]);

  const quotationsByStatus = { Draft: 0, Pending: 0, Approved: 0, Rejected: 0, Invoiced: 0 };
  for (const q of quotations) quotationsByStatus[q.status] += 1;
  const sentOut = quotations.length - quotationsByStatus.Draft;
  const conversionRate = sentOut > 0 ? Math.round((quotationsByStatus.Invoiced / sentOut) * 100) : 0;

  const now = new Date();
  let totalInvoiced = 0;
  let totalCollected = 0;
  let overdueAmount = 0;
  const invoicesByPaymentStatus = { Unpaid: 0, Partial: 0, Paid: 0 };
  for (const inv of invoices) {
    totalInvoiced += inv.total;
    totalCollected += inv.paidAmount;
    if (inv.dueDate && new Date(inv.dueDate) < now && inv.balance > 0) overdueAmount += inv.balance;
    invoicesByPaymentStatus[inv.paymentStatus] += 1;
  }
  const collectionRate = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100) : 0;

  return res.status(200).json({
    range: { from, to },
    quotations: {
      total: quotations.length,
      byStatus: quotationsByStatus,
      conversionRate,
    },
    invoices: {
      total: invoices.length,
      totalInvoiced: Math.round(totalInvoiced * 100) / 100,
      totalCollected: Math.round(totalCollected * 100) / 100,
      overdueAmount: Math.round(overdueAmount * 100) / 100,
      collectionRate,
      byPaymentStatus: invoicesByPaymentStatus,
    },
  });
}
