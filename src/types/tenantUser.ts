export interface TenantUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: 'Active' | 'Invited' | 'Deactivated';
  roleId?: string;
  roleName?: string;
  isOwner?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
  /** Effective permission list — the role's, unless hasCustomPermissions is true. */
  permissions?: string[];
  /** True when this user has a per-user permission override (ignores their role's list). */
  hasCustomPermissions?: boolean;
}
