import mongoose, { Schema, InferSchemaType } from 'mongoose';

const NotificationPrefsSchema = new Schema(
  {
    newLeads: { type: Boolean, default: true },
    failedPayments: { type: Boolean, default: true },
    newTickets: { type: Boolean, default: true },
    weeklyDigest: { type: Boolean, default: false },
    productUpdates: { type: Boolean, default: true },
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['super', 'tenant'], required: true },
    avatar: { type: String },
    // Only set for role: 'tenant' — which garage/Client this user belongs to.
    clientId: { type: Schema.Types.ObjectId, ref: 'Client' },
    // Only meaningful for role: 'super' — team-member sub-role for badges/Owner protection.
    teamRole: { type: String, enum: ['Owner', 'Admin', 'Support', 'Billing'] },
    // Only meaningful for role: 'tenant' — a garage staff member's sub-role.
    // Absent on every pre-existing tenant User (one-login-per-garage docs
    // created before this field existed) — never trust it bare, merge with
    // a default of 'Owner' at read time (api/_lib/auth.ts, serializeUser),
    // same lesson already learned from the notificationPrefs backfill bug.
    tenantRole: { type: String, enum: ['Owner', 'Manager', 'Technician', 'Cashier', 'Sales Executive'] },
    // The new custom-role system (api/_lib/models/Role.ts) — replacing tenantRole
    // above, which is left in place unwritten-to as a frozen historical remnant
    // once this is fully rolled out (see api/_lib/roleSeed.ts's resolveUserRole
    // for the one-time resolution from tenantRole -> roleId at login).
    roleId: { type: Schema.Types.ObjectId, ref: 'Role' },
    // Only meaningful for tenantRole 'Sales Executive' — this staff member's own
    // personal exposure cap for corporate (dealer) customers, enforced in
    // api/_lib/salesExecCredit.ts. Unlike Customer.creditLimit (where 0 means
    // "no cap"), 0/unset here means "not yet configured" and BLOCKS every
    // corporate transaction by this Sales Executive until an Owner/Manager
    // sets a positive value — deliberately fail-closed.
    creditLimit: { type: Number, default: 0 },
    // Only meaningful for role: 'tenant' — optional pin to one Branch.
    // Owner/Manager are typically unpinned (see all branches); a pinned
    // Technician/Cashier gets their branch-aware list queries force-scoped
    // to it server-side (api/_lib/branch.ts's requireBranchScope, not just
    // a UI filter).
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    phone: { type: String },
    // 'Invited' until first successful login, then flips to 'Active'. No email
    // delivery exists, so this is the real substitute for an accept-invite flow.
    // 'Deactivated' blocks login entirely (api/_lib/routes/auth/login.ts) —
    // set by a Super Admin from clients/[id]/users/[userId].ts, distinct
    // from a suspended Client (that's the whole tenant; this is one person).
    status: { type: String, enum: ['Active', 'Invited', 'Deactivated'], default: 'Active' },
    lastLoginAt: { type: Date },
    // When set (even to []), fully replaces role-based permission resolution
    // for this one user (api/_lib/auth.ts's hasPermission) — undefined (the
    // default) means "use the assigned Role's permissions," so every user
    // created before this field existed needs no migration. Never consulted
    // for an isProtectedOwner-role user, who passes every check unconditionally
    // regardless of this field. `default: undefined` is required here — Mongoose
    // otherwise auto-defaults Array paths to [], which would silently strip
    // every brand-new user down to zero permissions instead of falling back
    // to their role.
    permissionOverrides: { type: [String], default: undefined },
    notificationPrefs: { type: NotificationPrefsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: mongoose.Types.ObjectId };

export const User = mongoose.models.User || mongoose.model('User', UserSchema);
