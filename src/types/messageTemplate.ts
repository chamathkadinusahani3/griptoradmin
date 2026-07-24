export interface MessageTemplate {
  id: string;
  name: string;
  body: string;
}

export interface SmsLog {
  id: string;
  customerId?: string;
  customer?: string;
  to: string;
  message: string;
  sent: boolean;
  error?: string;
  createdAt: string;
}
