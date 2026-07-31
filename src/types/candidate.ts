export const CANDIDATE_STATUSES = ['Applied', 'Interviewing', 'Offered', 'Hired', 'Rejected'] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export interface Candidate {
  id: string;
  openingId: string;
  name: string;
  email?: string;
  phone?: string;
  status: CandidateStatus;
  notes?: string;
  createdAt: string;
}
