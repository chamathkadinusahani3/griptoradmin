import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../_lib/db';
import { JobCard, JobCardDoc } from '../_lib/models/JobCard';
import { Sale, SaleDoc } from '../_lib/models/Sale';
import { CustomerInvoice, CustomerInvoiceDoc } from '../_lib/models/CustomerInvoice';
import { Part, PartDoc } from '../_lib/models/Part';
import { Technician, TechnicianDoc } from '../_lib/models/Technician';
import { Service, ServiceDoc } from '../_lib/models/Service';
import { requireTenant } from '../_lib/auth';
import { resolveBranchFilter } from '../_lib/branch';

const RANGE_DAYS: Record<string, number> = { '7': 7, '30': 30, '90': 90, '365': 365 };

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function resolveRange(req: VercelRequest): { from: Date; to: Date } {
  const { range, from, to } = req.query;
  if (range === 'custom' && typeof from === 'string' && typeof to === 'string') {
    const f = new Date(`${from}T00:00:00.000Z`);
    const t = new Date(`${to}T23:59:59.999Z`);
    if (!isNaN(f.getTime()) && !isNaN(t.getTime())) return { from: f, to: t };
  }
  const days = RANGE_DAYS[typeof range === 'string' ? range : ''] ?? 30;
  const now = new Date();
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - (days - 1));
  fromDate.setHours(0, 0, 0, 0);
  return { from: fromDate, to: now };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireTenant(req, res);
  if (!session) return;

  const { from, to } = resolveRange(req);
  const { branchId } = req.query;
  const effectiveBranchId = resolveBranchFilter(session, typeof branchId === 'string' ? branchId : undefined);
  // Quotations/CustomerInvoice deliberately have no branchId (Phase 9) —
  // accounting stays company-wide, so this filter never touches them.
  const branchFilter = effectiveBranchId ? { branchId: effectiveBranchId } : {};

  await connectToDatabase();

  const [jobs, sales, invoices, parts, technicians, services] = await Promise.all([
    JobCard.find({ clientId: session.clientId, createdAt: { $gte: from, $lte: to }, ...branchFilter }).lean() as Promise<JobCardDoc[]>,
    Sale.find({ clientId: session.clientId, createdAt: { $gte: from, $lte: to }, ...branchFilter }).lean() as Promise<SaleDoc[]>,
    // Not range-filtered — a payment can arrive well after invoice creation,
    // and "outstanding" is a current snapshot, not a range-bound figure.
    CustomerInvoice.find({ clientId: session.clientId, status: { $ne: 'Void' } }).lean() as Promise<CustomerInvoiceDoc[]>,
    Part.find({ clientId: session.clientId, ...branchFilter }).lean() as Promise<PartDoc[]>,
    Technician.find({ clientId: session.clientId, ...branchFilter }).lean() as Promise<TechnicianDoc[]>,
    Service.find({ clientId: session.clientId }).lean() as Promise<ServiceDoc[]>,
  ]);

  const technicianNameById = new Map(technicians.map((t) => [t._id.toString(), t.name]));
  // Best-effort case-insensitive match from a JobCard's free-text `service`
  // to the real Service catalog — JobCard predates the Service model, so
  // there's no real FK here, just a name lookup.
  const serviceDurationByName = new Map(services.map((s) => [s.name.toLowerCase(), s.durationMinutes]));

  // --- Revenue: collected = Sale.total (immediate) + in-range invoice payments ---
  const dailyRevenue = new Map<string, number>();
  const monthlyRevenue = new Map<string, number>();
  let collected = 0;
  for (const sale of sales) {
    const d = (sale as unknown as { createdAt: Date }).createdAt;
    const day = dateKey(d);
    const month = day.slice(0, 7);
    dailyRevenue.set(day, (dailyRevenue.get(day) ?? 0) + sale.total);
    monthlyRevenue.set(month, (monthlyRevenue.get(month) ?? 0) + sale.total);
    collected += sale.total;
  }
  let outstanding = 0;
  for (const inv of invoices) {
    outstanding += inv.balance;
    for (const payment of inv.paymentHistory) {
      const pd = new Date(payment.date);
      if (pd >= from && pd <= to) {
        const day = dateKey(pd);
        const month = day.slice(0, 7);
        dailyRevenue.set(day, (dailyRevenue.get(day) ?? 0) + payment.amount);
        monthlyRevenue.set(month, (monthlyRevenue.get(month) ?? 0) + payment.amount);
        collected += payment.amount;
      }
    }
  }

  // --- Jobs ---
  interface ServiceAgg { total: number; completed: number; actualMinutes: number[]; }
  interface TechAgg { total: number; completed: number; actualMinutes: number[]; }
  const byServiceMap = new Map<string, ServiceAgg>();
  const byTechMap = new Map<string, TechAgg>();
  const dailyVolume = new Map<string, { completed: number; inProgress: number; total: number }>();

  let completedJobs = 0;
  for (const job of jobs) {
    const day = dateKey((job as unknown as { createdAt: Date }).createdAt);
    const dv = dailyVolume.get(day) ?? { completed: 0, inProgress: 0, total: 0 };
    dv.total += 1;
    if (job.status === 'Completed') dv.completed += 1;
    if (job.status === 'In Progress') dv.inProgress += 1;
    dailyVolume.set(day, dv);

    const isCompleted = job.status === 'Completed';
    if (isCompleted) completedJobs += 1;
    const actualMinutes =
      isCompleted && job.startedAt && job.completedAt
        ? (new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 60000
        : null;

    const serviceName = job.service || 'Unspecified';
    const svc = byServiceMap.get(serviceName) ?? { total: 0, completed: 0, actualMinutes: [] };
    svc.total += 1;
    if (isCompleted) svc.completed += 1;
    if (actualMinutes !== null) svc.actualMinutes.push(actualMinutes);
    byServiceMap.set(serviceName, svc);

    const techId = job.technicianId.toString();
    const tech = byTechMap.get(techId) ?? { total: 0, completed: 0, actualMinutes: [] };
    tech.total += 1;
    if (isCompleted) tech.completed += 1;
    if (actualMinutes !== null) tech.actualMinutes.push(actualMinutes);
    byTechMap.set(techId, tech);
  }

  const avg = (nums: number[]) => (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : undefined);

  const byService = Array.from(byServiceMap.entries())
    .map(([service, agg]) => {
      const avgActualMinutes = avg(agg.actualMinutes);
      const estimatedMinutes = serviceDurationByName.get(service.toLowerCase());
      const efficiencyPct =
        avgActualMinutes !== undefined && estimatedMinutes !== undefined && avgActualMinutes > 0
          ? Math.round((estimatedMinutes / avgActualMinutes) * 100)
          : undefined;
      return { service, total: agg.total, completed: agg.completed, avgActualMinutes, estimatedMinutes, efficiencyPct };
    })
    .sort((a, b) => b.total - a.total);

  const byTechnician = Array.from(byTechMap.entries())
    .map(([techId, agg]) => ({
      technician: technicianNameById.get(techId) ?? 'Unknown',
      total: agg.total,
      completed: agg.completed,
      avgActualMinutes: avg(agg.actualMinutes),
    }))
    .sort((a, b) => b.completed - a.completed);

  // --- Inventory (current snapshot, not range-bound) ---
  const byCategoryMap = new Map<string, { value: number; count: number }>();
  let totalValue = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  for (const part of parts) {
    const value = part.stock * part.price;
    totalValue += value;
    if (part.stock === 0) outOfStockCount += 1;
    else if (part.stock <= part.reorderAt) lowStockCount += 1;
    const cat = byCategoryMap.get(part.category) ?? { value: 0, count: 0 };
    cat.value += value;
    cat.count += 1;
    byCategoryMap.set(part.category, cat);
  }
  const topItemsByValue = [...parts]
    .map((p) => ({ name: p.name, category: p.category, stock: p.stock, price: p.price, value: p.stock * p.price }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);

  return res.status(200).json({
    range: { from, to },
    revenue: {
      collected: Math.round(collected * 100) / 100,
      outstanding: Math.round(outstanding * 100) / 100,
      dailyTrend: Array.from(dailyRevenue.entries()).map(([date, value]) => ({ date, collected: value })).sort((a, b) => a.date.localeCompare(b.date)),
      monthlyTrend: Array.from(monthlyRevenue.entries()).map(([month, value]) => ({ month, collected: value })).sort((a, b) => a.month.localeCompare(b.month)),
    },
    jobs: {
      total: jobs.length,
      completed: completedJobs,
      completionRate: jobs.length ? Math.round((completedJobs / jobs.length) * 100) : 0,
      byService,
      byTechnician,
      dailyVolume: Array.from(dailyVolume.entries()).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
    },
    inventory: {
      totalItems: parts.length,
      totalValue: Math.round(totalValue * 100) / 100,
      lowStockCount,
      outOfStockCount,
      byCategory: Array.from(byCategoryMap.entries()).map(([category, v]) => ({ category, ...v })).sort((a, b) => b.value - a.value),
      topItemsByValue,
    },
  });
}
