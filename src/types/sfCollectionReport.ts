export interface SfCollectionReportRow {
  collectionId: string;
  salespersonName: string;
  customerName: string;
  date: string;
  amount: number;
  method: 'Cash' | 'Cheque' | 'Card' | 'Bank Transfer' | 'Other';
}

export interface SfCollectionReport {
  range: { from: string; to: string };
  summary: {
    totalCollected: number;
    cashTotal: number;
    chequeTotal: number;
    count: number;
  };
  rows: SfCollectionReportRow[];
}
