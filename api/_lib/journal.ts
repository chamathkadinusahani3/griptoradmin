import mongoose, { ClientSession } from 'mongoose';
import { JournalEntry } from './models/JournalEntry.js';
import { ChartOfAccounts } from './models/ChartOfAccounts.js';
import { ensureDefaultChartOfAccounts } from './chartOfAccountsSeed.js';

export type JournalSourceType = 'sale' | 'customer-payment' | 'supplier-payment' | 'expense' | 'payroll' | 'return-refund';

interface PostJournalEntryInput {
  clientId: string;
  date?: Date;
  description: string;
  sourceType: JournalSourceType;
  sourceId: string;
  lines: { accountId: string; debit?: number; credit?: number }[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The ONLY writer of JournalEntry — every call site in this codebase (POS
 * checkout, customer/supplier payments, expense creation, payroll finalize,
 * return refunds) goes through this one function, so "does every entry
 * balance" only ever needs verifying in one place.
 *
 * Throws (before writing anything) if debits don't equal credits — a
 * caller bug, not a business exception, so it's deliberately NOT caught
 * silently here. Callers that post best-effort (outside an existing
 * transaction) are responsible for their own try/catch — see
 * expenses/index.ts's comment for why a broken journal entry must never
 * block the primary record it describes from saving.
 *
 * Pass `session` when the caller already has an open transaction (POS
 * checkout, Returns) so the posting is atomic with the primary write;
 * omit it for callers with no transaction of their own (customer/supplier
 * payments, expenses, payroll) — those post as a separate best-effort
 * write after the primary one commits.
 */
export async function postJournalEntry(input: PostJournalEntryInput, session?: ClientSession): Promise<void> {
  const totalDebit = round2(input.lines.reduce((sum, l) => sum + (l.debit ?? 0), 0));
  const totalCredit = round2(input.lines.reduce((sum, l) => sum + (l.credit ?? 0), 0));
  if (totalDebit !== totalCredit || totalDebit === 0) {
    throw new Error(`Unbalanced journal entry for ${input.sourceType} ${input.sourceId}: debit ${totalDebit} != credit ${totalCredit}`);
  }

  await JournalEntry.create(
    [
      {
        clientId: input.clientId,
        date: input.date ?? new Date(),
        description: input.description,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        lines: input.lines.map((l) => ({ accountId: l.accountId, debit: l.debit ?? 0, credit: l.credit ?? 0 })),
      },
    ],
    session ? { session } : undefined
  );
}

/**
 * Resolves Chart of Accounts ids by their default names (e.g. 'Cash',
 * 'Sales Revenue') for a tenant, seeding the defaults first if they don't
 * exist yet — every posting call site uses this instead of querying
 * ChartOfAccounts directly, so a tenant who's never opened the Chart of
 * Accounts page still gets a working set of accounts to post against the
 * very first time any money moves.
 */
export async function getAccountIdsByNames(clientId: string, names: string[]): Promise<Map<string, string>> {
  await ensureDefaultChartOfAccounts(clientId);
  const accounts = await ChartOfAccounts.find({ clientId, name: { $in: names } }).select('name').lean();
  return new Map(accounts.map((a) => [a.name as string, (a._id as mongoose.Types.ObjectId).toString()]));
}

/** Cash-method payments/expenses post to the Cash account; every other method (Card, Bank Transfer, Cheque, Other) posts to Bank — cheques/transfers settle through the bank, not the till. */
export function cashOrBankAccountName(method: string): 'Cash' | 'Bank' {
  return method === 'Cash' ? 'Cash' : 'Bank';
}
