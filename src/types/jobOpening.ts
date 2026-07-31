export type JobOpeningStatus = 'Open' | 'Closed';

export interface JobOpening {
  id: string;
  title: string;
  description?: string;
  status: JobOpeningStatus;
  candidateCount: number;
  createdAt: string;
}
