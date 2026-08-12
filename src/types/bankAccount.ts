export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolderName?: string;
  branch?: string;
  notes?: string;
  createdAt: string;
}
