export interface AccountsDashboardAgingBucket {
  bucket: 'Current' | '1-30' | '31-60' | '61-90' | '90+';
  count: number;
  amount: number;
}

export interface AccountsDashboardAging {
  total: number;
  byBucket: AccountsDashboardAgingBucket[];
}

export interface AccountsDashboardChequeItem {
  id: string;
  chequeNumber: string;
  direction: 'incoming' | 'outgoing';
  amount: number;
  dueDate?: string;
  party?: string;
}

export interface AccountsDashboardCollectionItem {
  id: string;
  customerName?: string;
  amount: number;
  method: string;
  date: string;
}

export interface AccountsDashboardSummary {
  asOf: string;
  arAging: AccountsDashboardAging;
  apAging: AccountsDashboardAging;
  cheques: {
    pendingCount: number;
    pendingAmount: number;
    upcoming: AccountsDashboardChequeItem[];
  };
  collections: {
    todayTotal: number;
    todayCount: number;
    recent: AccountsDashboardCollectionItem[];
  };
}
