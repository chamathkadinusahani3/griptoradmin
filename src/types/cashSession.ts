export interface CashSession {
  id: string;
  branchId?: string;
  openedBy: string;
  openedByName?: string;
  openingFloat: number;
  status: 'Open' | 'Closed';
  closedBy?: string;
  closedByName?: string;
  closedAt?: string;
  expectedCashIn?: number;
  expectedCashOut?: number;
  expectedClosingAmount?: number;
  closingCountedAmount?: number;
  variance?: number;
  notes?: string;
  createdAt: string;
}
