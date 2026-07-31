import mongoose, { Schema, InferSchemaType } from 'mongoose';

const RoleSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    name: { type: String, required: true },
    // Purely a grouping/filter label for the (large) role catalog's picker
    // UI (Super Admin's Create User modal) — never read by any permission
    // check. Absent on roles seeded before this field existed; serializeRole
    // backfills those from SEED_ROLES' own department by name, same
    // backfill-at-read discipline used elsewhere in this project.
    department: { type: String },
    // Exactly one per tenant, seeded once at Client creation, never assignable
    // via PATCH /staff/:id — an Owner's access is always `isOwner === true`
    // short-circuiting every permission check (api/_lib/auth.ts), never a
    // materialized list here, so it automatically covers every future
    // permission with no migration. `permissions` is ignored for this role.
    isProtectedOwner: { type: Boolean, default: false },
    permissions: { type: [String], default: [] },
    // Replaces the old `tenantRole === 'Technician' || 'Cashier'` string
    // check in api/_lib/branch.ts's resolveBranchFilter — a role-level
    // config flag, not a permission grant.
    branchPinned: { type: Boolean, default: false },
    // Replaces the old `tenantRole === 'Sales Executive'` check in
    // api/_lib/salesExecCredit.ts — the actual limit value stays on
    // User.creditLimit (per-user), this only marks whether the role is
    // subject to that enforcement at all.
    requiresCreditLimit: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Required for safe idempotent seeding (api/_lib/roleSeed.ts) — without this,
// two staff members of a never-before-seeded tenant logging in concurrently
// could each insert a full set of default roles, doubling them.
RoleSchema.index({ clientId: 1, name: 1 }, { unique: true });

export type RoleDoc = InferSchemaType<typeof RoleSchema> & { _id: mongoose.Types.ObjectId };

export const Role = mongoose.models.Role || mongoose.model('Role', RoleSchema);
