export interface CashHandover {
  id: string;
  cashHandoverNumber: string;
  branchId?: string;
  handedOverBy: string;
  handedOverByName?: string;
  receivedBy: string;
  receivedByName?: string;
  amount: number;
  date: string;
  notes?: string;
  createdAt: string;
}
