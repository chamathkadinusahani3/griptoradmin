export interface BankTransaction {
  id: string;
  direction: 'in' | 'out';
  date: string;
  amount: number;
  method: string;
  chequeNumber?: string;
  bankAccountId?: string;
  bankAccount?: string;
  reconciled: boolean;
  party?: string;
  reference: string;
  sourceId: string;
  sourceType: 'invoice' | 'purchase-order' | 'return';
}

export interface BankTransactionSummary {
  totalIn: number;
  totalOut: number;
  transactionCount: number;
  chequeCount: number;
  pendingReconciliation: number;
}
