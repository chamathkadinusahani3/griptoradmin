export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolderName?: string;
  branch?: string;
  notes?: string;
  /** How many days a Card payment through this account takes to settle. Used to dynamically calculate a Card payment's settlement date. Defaults to 2. */
  cardSettlementDays: number;
  createdAt: string;
}
