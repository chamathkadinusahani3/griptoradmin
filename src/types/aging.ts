export type AgingBucket = 'Current' | '1-30' | '31-60' | '61-90' | '90+';

export interface AgingReport {
  asOf: string;
  totalOutstanding: number;
  byBucket: { bucket: AgingBucket; count: number; amount: number }[];
}

export interface ArAgingReport extends AgingReport {
  customers: { id: string; name: string; outstanding: number; oldestBucket: AgingBucket }[];
}

export interface ApAgingReport extends AgingReport {
  suppliers: { id: string; name: string; outstanding: number; oldestBucket: AgingBucket }[];
}
