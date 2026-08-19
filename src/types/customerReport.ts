export interface CustomerReport {
  range: { from: string; to: string };
  newCustomers: number;
  totalCustomers: number;
  avgRating: number | null;
  feedbackCount: number;
  ratingDistribution: { stars: number; count: number }[];
  pointsEarned: number;
  pointsRedeemed: number;
  complaintsTotal: number;
  complaintsByStatus: Record<string, number>;
  dailyNewCustomers: { date: string; count: number }[];
}
