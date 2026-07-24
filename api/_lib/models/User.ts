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
    tenantRole: { type: String, enum: ['Owner', 'Manager', 'Technician', 'Cashier'] },
    // Only meaningful for role: 'tenant' — optional pin to one Branch.
    // Owner/Manager are typically unpinned (see all branches); a pinned
    // Technician/Cashier gets their branch-aware list queries force-scoped
    // to it server-side (api/_lib/branch.ts's requireBranchScope, not just
    // a UI filter).
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    // 'Invited' until first successful login, then flips to 'Active'. No email
    // delivery exists, so this is the real substitute for an accept-invite flow.
    status: { type: String, enum: ['Active', 'Invited'], default: 'Active' },
    notificationPrefs: { type: NotificationPrefsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: mongoose.Types.ObjectId };

export const User = mongoose.models.User || mongoose.model('User', UserSchema);
