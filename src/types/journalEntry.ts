export interface JournalEntryLine {
  accountId: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  date: string;
  description: string;
  sourceType: 'sale' | 'customer-payment' | 'supplier-payment' | 'expense' | 'payroll' | 'return-refund';
  sourceId: string;
  lines: JournalEntryLine[];
  createdAt: string;
}

export interface AccountTotal {
  accountId: string;
  accountName: string;
  debit: number;
  credit: number;
  net: number;
}

export interface JournalEntriesResponse {
  range: { from: string; to: string };
  entries: JournalEntry[];
  accountTotals: AccountTotal[];
}
