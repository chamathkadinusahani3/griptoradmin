export interface Feedback {
  id: string;
  customerId: string;
  customer?: string;
  service?: string;
  rating: number;
  comment?: string;
  responded: boolean;
  date: string;
}
