import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Supplier, SupplierDoc } from '../../models/Supplier.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../models/PurchaseOrder.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeSupplier } from '../../serializers.js';

interface CreateSupplierBody {
  name?: string;
  contact?: string;
  email?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'suppliers:view');
  if (!session) return;

  await connectToDatabase();
  const suppliers = (await Supplier.find({ clientId: session.clientId }).sort({ createdAt: 1 }).lean()) as SupplierDoc[];

  // openOrders/lastOrder/onTime are derived live from real PurchaseOrder
  // documents here — never stored on Supplier itself, the same "derive,
  // don't store" rule already used for Bay occupancy/Technician.activeJobs,
  // so these numbers can't drift the way Anura's two-collection design did.
  const orders = (await PurchaseOrder.find({ clientId: session.clientId }).lean()) as PurchaseOrderDoc[];
  const statsBySupplier = new Map<
    string,
    { openOrders: number; lastOrder: Date | null; received: number; onTimeCount: number; onTimeEligible: number; totalOutstanding: number; totalPaid: number }
  >();
  for (const order of orders) {
    const key = order.supplierId.toString();
    const stat = statsBySupplier.get(key) ?? { openOrders: 0, lastOrder: null, received: 0, onTimeCount: 0, onTimeEligible: 0, totalOutstanding: 0, totalPaid: 0 };
    if (order.status === 'Draft' || order.status === 'Ordered' || order.status === 'Partially Received') stat.openOrders += 1;
    // On-time delivery is only meaningful once a PO is FULLY received —
    // a partial delivery hasn't finished, so it can't yet be judged early/late.
    if (order.status === 'Received' && order.receivedAt) {
      if (!stat.lastOrder || order.receivedAt > stat.lastOrder) stat.lastOrder = order.receivedAt;
      if (order.expectedDate) {
        stat.onTimeEligible += 1;
        if (order.receivedAt <= order.expectedDate) stat.onTimeCount += 1;
      }
    }
    // Debit/credit standing — Ordered/Partially Received/Received POs are
    // all real payables (matching purchaseOrderPayments.ts's own
    // payable-state guard); a Draft or Cancelled PO was never actually
    // owed to the supplier.
    if (order.status === 'Ordered' || order.status === 'Partially Received' || order.status === 'Received') {
      stat.totalOutstanding += order.balance ?? order.total;
      stat.totalPaid += order.paidAmount ?? 0;
    }
    statsBySupplier.set(key, stat);
  }

  return res.status(200).json({
    suppliers: suppliers.map((s) => {
      const stat = statsBySupplier.get(s._id.toString());
      return serializeSupplier(s, {
        openOrders: stat?.openOrders ?? 0,
        lastOrder: stat?.lastOrder ?? null,
        onTime: stat && stat.onTimeEligible > 0 ? Math.round((stat.onTimeCount / stat.onTimeEligible) * 100) : null,
        totalOutstanding: stat ? Math.round(stat.totalOutstanding * 100) / 100 : 0,
        totalPaid: stat ? Math.round(stat.totalPaid * 100) / 100 : 0,
      });
    }),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'suppliers:manage');
  if (!session) return;

  const { name, contact, email } = (req.body ?? {}) as CreateSupplierBody;
  if (!name) return res.status(400).json({ error: 'name is required' });

  await connectToDatabase();
  const supplier = await Supplier.create({ clientId: session.clientId, name, contact, email });

  return res.status(201).json({ supplier: serializeSupplier(supplier.toObject()) });
}
