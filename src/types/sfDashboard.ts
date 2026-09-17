export interface SfDashboardSummary {
  range: { from: string; to: string };
  salespersons: { total: number; active: number; inactive: number };
  visits: {
    total: number;
    Pending: number;
    'In Progress': number;
    Completed: number;
    Cancelled: number;
    Rescheduled: number;
  };
  targets: {
    totalTarget: number;
    totalActual: number;
    achievementPct: number | null;
    targetCount: number;
  };
  collections: {
    today: number;
    cash: number;
    cheque: number;
  };
  deliveries: {
    pending: number;
    completed: number;
    totalLoad: number;
  };
  trips: {
    estimatedFuelCost: number;
    totalDistanceKm: number;
    visitsWithFuelEstimate: number;
  };
}
