export interface PricingTier {
  id: string;
  name: string;
  price: number | null;
  cadence: string;
  popular?: boolean;
  description: string;
  features: string[];
  hidden?: boolean;
}

export interface BillingSummary {
  totalMrr: number;
  mrrByPlan: { plan: string; mrr: number; clients: number }[];
  failedInvoiceCount: number;
  collectedThisMonth: number;
}
