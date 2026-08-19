export interface BookingReport {
  range: { from: string; to: string };
  total: number;
  conversionRate: number;
  cancellationRate: number;
  onlineSharePct: number;
  byStatus: Record<string, number>;
  bySource: { public: number; staff: number };
  dailyVolume: { date: string; count: number }[];
}
