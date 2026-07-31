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
  source: 'manual' | 'low-stock-alert' | 'dealer-outstanding-report';
  createdAt: string;
}
