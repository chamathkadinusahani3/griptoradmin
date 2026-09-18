import { Employee, EmployeeDoc } from './models/Employee.js';
import { Salesperson, SalespersonDoc } from './models/Salesperson.js';
import { User } from './models/User.js';

/**
 * Bridges a tenant login (User) to a Salesperson record, auto-provisioning
 * whatever's missing along the User -> Employee -> Salesperson chain that
 * "My Dealers" (salespersons/me/dealers.ts) resolves the OTHER direction at
 * read time. Lets a dealer-registration flow assign "this actual staff
 * login" as the sales rep, rather than requiring an admin to have already
 * hand-created a matching Employee + Salesperson first — without that,
 * assigning a Salesperson with no real Employee/User link would leave the
 * dealer permanently invisible on "My Dealers" for anyone.
 *
 * Never creates a SECOND Salesperson for a User who already has one via
 * their Employee link — reuses it. Never creates a second Employee for a
 * User who already has one, same reasoning.
 */
export async function resolveOrCreateSalespersonForUser(
  clientId: string,
  userId: string
): Promise<{ salespersonId: string } | { error: string }> {
  const user = await User.findOne({ _id: userId, clientId, role: 'tenant' }).select('name email').lean();
  if (!user) return { error: 'User not found' };

  let employee = (await Employee.findOne({ clientId, userId }).lean()) as EmployeeDoc | null;
  if (!employee) {
    const created = await Employee.create({ clientId, userId });
    employee = created.toObject() as EmployeeDoc;
  }

  const existingSalesperson = (await Salesperson.findOne({ clientId, employeeId: employee._id }).lean()) as SalespersonDoc | null;
  if (existingSalesperson) return { salespersonId: existingSalesperson._id.toString() };

  const code = await generateUniqueSalespersonCode(clientId);
  const created = await Salesperson.create({
    clientId,
    code,
    name: user.name,
    email: user.email,
    employeeId: employee._id,
  });
  return { salespersonId: created._id.toString() };
}

/** Best-effort, not race-proof — matches this codebase's existing tolerance for a low-frequency, staff-only admin action (same reasoning as several other "good enough" uniqueness loops elsewhere). */
async function generateUniqueSalespersonCode(clientId: string): Promise<string> {
  const count = await Salesperson.countDocuments({ clientId });
  for (let i = 0; i < 20; i++) {
    const candidate = String(count + 1 + i).padStart(3, '0');
    const exists = await Salesperson.exists({ clientId, code: candidate });
    if (!exists) return candidate;
  }
  return `SP-${Date.now()}`;
}
