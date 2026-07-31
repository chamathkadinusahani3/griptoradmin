export type BookingStatus = 'Pending' | 'Waiting' | 'In Progress' | 'Completed' | 'Cancelled';

export interface Booking {
  id: string;
  customerId: string;
  customer?: string;
  serviceIds: string[];
  services?: string[];
  vehicle: string;
  plate?: string;
  date: string;
  timeSlot: string;
  status: BookingStatus;
  notes?: string;
  source: 'public' | 'staff';
  jobCardId?: string;
  branchId?: string;
  bayId?: string;
  bay?: string;
  createdAt: string;
}

export interface PublicBookingInfo {
  clientName: string;
  services: { id: string; name: string; category?: string; durationMinutes: number; active: boolean }[];
  branches: { id: string; name: string; address?: string; phone?: string; isDefault: boolean }[];
}

export interface AvailabilitySlot {
  time: string;
  booked: number;
  capacity: number;
  available: boolean;
}
