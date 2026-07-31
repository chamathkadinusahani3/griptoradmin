export interface Role {
  id: string;
  name: string;
  department?: string;
  isProtectedOwner: boolean;
  permissions: string[];
  branchPinned: boolean;
  requiresCreditLimit: boolean;
  memberCount: number;
}
