import type { VercelRequest } from '@vercel/node';

const RANGE_DAYS: Record<string, number> = { '30': 30, '90': 90, '365': 365 };

/**
 * Shared ?range=30|90|365|custom&from=&to= resolver — every per-module
 * report route uses this exact same convention (originally written inline
 * in tenant/reports.ts and tenant/financial-overview.ts; extracted here once
 * a third caller needed the identical logic, rather than a 4th/5th/6th copy).
 */
export function resolveReportRange(req: VercelRequest): { from: Date; to: Date } {
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
