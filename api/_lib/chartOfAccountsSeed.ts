import { ChartOfAccounts } from './models/ChartOfAccounts.js';
import { EXPENSE_CATEGORIES } from './models/Expense.js';

// A minimal, real chart of accounts for a garage/auto-shop — enough for
// Phase 8's auto-posting to have somewhere real to post every existing
// money-movement route against. The 1:1 naming with EXPENSE_CATEGORIES
// (below) is deliberate — see accountIdForExpenseCategory(). Account names
// are also how journal.ts's getAccountIdsByNames() resolves postings, so
// treat every `name` here as a stable identifier, not just a label.
export const DEFAULT_CHART_OF_ACCOUNTS: { code: string; name: string; type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense' }[] = [
  { code: '1000', name: 'Cash', type: 'Asset' },
  { code: '1010', name: 'Bank', type: 'Asset' },
  { code: '1200', name: 'Accounts Receivable', type: 'Asset' },
  { code: '1300', name: 'Inventory', type: 'Asset' },
  // Added in Phase 9 for SalaryAdvance's own GL posting — same incremental-
  // seed reasoning as Phase 8's two additions above.
  { code: '1400', name: 'Employee Advances', type: 'Asset' },
  { code: '2000', name: 'Accounts Payable', type: 'Liability' },
  // Added in Phase 8 for GL auto-posting — see the incremental-seed comment
  // on ensureDefaultChartOfAccounts() for why a tenant who already ran
  // Phase 7's seed still gets these two.
  { code: '2100', name: 'Sales Tax Payable', type: 'Liability' },
  { code: '3000', name: "Owner's Equity", type: 'Equity' },
  { code: '4000', name: 'Sales Revenue', type: 'Revenue' },
  { code: '4100', name: 'Service Revenue', type: 'Revenue' },
  { code: '4900', name: 'Sales Returns & Allowances', type: 'Revenue' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'Expense' },
  ...EXPENSE_CATEGORIES.map((category) => ({ code: '', name: `${category} Expense`, type: 'Expense' as const })),
];

// Expense-category codes assigned sequentially after the fixed block above
// (5100, 5200, ...) — computed here instead of hardcoded so adding a new
// EXPENSE_CATEGORIES entry doesn't require also editing this file.
function withExpenseCategoryCodes() {
  let nextCode = 5100;
  return DEFAULT_CHART_OF_ACCOUNTS.map((a) => (a.code ? a : { ...a, code: String(nextCode++) }));
}

/**
 * Idempotent, lazy seed — called from chart-of-accounts/index.ts's GET
 * handler AND from journal.ts before every posting, rather than a one-time
 * migration script, so both brand-new tenants and every tenant that existed
 * before this phase get the same default accounts, with no destructive
 * write against existing data required.
 *
 * Incremental by NAME (not a single "any accounts exist ⇒ skip" check) —
 * Phase 8 added two new default accounts (Sales Tax Payable, Sales Returns
 * & Allowances) after Phase 7 already shipped this same function. A tenant
 * who visited Chart of Accounts under Phase 7 already has a non-empty
 * account list, so an existingCount>0 short-circuit would have silently
 * left them without the two new accounts forever. Checking by name instead
 * means this function stays safe to extend with more defaults in future
 * phases too.
 */
export async function ensureDefaultChartOfAccounts(clientId: string): Promise<void> {
  const defaults = withExpenseCategoryCodes();
  const existing = await ChartOfAccounts.find({ clientId, name: { $in: defaults.map((a) => a.name) } })
    .select('name')
    .lean();
  const existingNames = new Set(existing.map((a) => a.name));
  const missing = defaults.filter((a) => !existingNames.has(a.name));
  if (missing.length === 0) return;
  await ChartOfAccounts.insertMany(
    missing.map((a) => ({ clientId, ...a, isSystem: true })),
    { ordered: false }
  );
}

/** The default Expense-category account, for auto-tagging a new Expense when the client didn't pick one explicitly. */
export async function accountIdForExpenseCategory(clientId: string, category: string): Promise<string | undefined> {
  const account = await ChartOfAccounts.findOne({ clientId, name: `${category} Expense`, isSystem: true }).select('_id').lean();
  return (account as { _id: { toString(): string } } | null)?._id?.toString();
}
