export interface RevenuePoint {
  date: string;
  collected: number;
}

export interface RevenueMonthPoint {
  month: string;
  collected: number;
}

export interface ServiceReport {
  service: string;
  total: number;
  completed: number;
  avgActualMinutes?: number;
  estimatedMinutes?: number;
  efficiencyPct?: number;
}

export interface TechnicianReport {
  technician: string;
  total: number;
  completed: number;
  avgActualMinutes?: number;
}

export interface DailyVolumePoint {
  date: string;
  completed: number;
  inProgress: number;
  total: number;
}

export interface CategoryReport {
  category: string;
  value: number;
  count: number;
}

export interface TopItemReport {
  name: string;
  category: string;
  stock: number;
  price: number;
  value: number;
}

export interface TenantReports {
  range: { from: string; to: string };
  revenue: {
    collected: number;
    outstanding: number;
    dailyTrend: RevenuePoint[];
    monthlyTrend: RevenueMonthPoint[];
  };
  jobs: {
    total: number;
    completed: number;
    completionRate: number;
    byService: ServiceReport[];
    byTechnician: TechnicianReport[];
    dailyVolume: DailyVolumePoint[];
  };
  inventory: {
    totalItems: number;
    totalValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    byCategory: CategoryReport[];
    topItemsByValue: TopItemReport[];
  };
}

export type ReportRange = '7' | '30' | '90' | '365' | 'custom';
