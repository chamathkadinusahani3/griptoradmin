import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { requireTenantPermission } from '../../auth.js';
import { computePendingDeliveries } from '../../pendingDeliveries.js';

// Point-in-time snapshot (like AR/AP Aging) rather than range-filtered —
// "pending" is a live state, not a historical window. Reuses the exact
// same computation as the Pending Deliveries page and the SF Dashboard.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'reports:view');
  if (!session) return;

  await connectToDatabase();
  const deliveries = await computePendingDeliveries(session.clientId);

  const rows = deliveries.map((d) => ({
    salesOrderId: d.salesOrderId,
    salesOrderNumber: d.salesOrderNumber,
    customerName: d.customerName ?? 'Unknown',
    outstandingItemCount: d.items.length,
    totalVolume: d.totalVolume,
    suggestedVehicleType: d.suggestedVehicleType,
    assignmentStatus: d.assignment?.status ?? 'Unassigned',
    routeName: d.assignment?.routeName,
    driverName: d.assignment?.driverName,
  }));

  const totalVolume = Math.round(rows.reduce((sum, r) => sum + r.totalVolume, 0) * 100) / 100;
  const unassignedCount = rows.filter((r) => r.assignmentStatus === 'Unassigned').length;

  return res.status(200).json({
    asOf: new Date(),
    summary: { totalPending: rows.length, totalVolume, unassignedCount },
    rows,
  });
}
