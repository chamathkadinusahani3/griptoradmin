// Shared AR/AP aging-bucket rule — used by both ar-aging.ts and ap-aging.ts
// so the bucket thresholds can't drift between the two directions of money.
export type AgingBucket = 'Current' | '1-30' | '31-60' | '61-90' | '90+';

export function bucketAge(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'Current';
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}
