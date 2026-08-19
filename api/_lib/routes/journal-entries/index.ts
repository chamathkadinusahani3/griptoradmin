import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { JournalEntry, JournalEntryDoc } from '../../models/JournalEntry.js';
import { ChartOfAccounts, ChartOfAccountsDoc } from '../../models/ChartOfAccounts.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveReportRange } from '../../reportRange.js';
import { serializeJournalEntry } from '../../serializers.js';

// Read-only — the entire General Ledger. Every entry here was written by
// journal.ts's postJournalEntry, auto-posted from an existing
// money-movement route; nothing on this page is ever entered directly.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'bank-accounts:view');
  if (!session) return;

  await connectToDatabase();
  const { accountId } = req.query;
  const { from, to } = resolveReportRange(req);

  const filter: Record<string, unknown> = { clientId: session.clientId, date: { $gte: from, $lte: to } };
  if (typeof accountId === 'string') filter['lines.accountId'] = accountId;

  const entries = (await JournalEntry.find(filter).sort({ date: -1, createdAt: -1 }).lean()) as JournalEntryDoc[];
  const accounts = (await ChartOfAccounts.find({ clientId: session.clientId }).lean()) as ChartOfAccountsDoc[];
  const accountNameById = new Map(accounts.map((a) => [a._id.toString(), `${a.code} · ${a.name}`]));

  // A trial-balance-style summary alongside the raw entries — total
  // debit/credit per account within the selected range, the same "derive,
  // don't store" a running balance would otherwise need.
  const totalsByAccount = new Map<string, { accountName: string; debit: number; credit: number }>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      const key = line.accountId.toString();
      const t = totalsByAccount.get(key) ?? { accountName: accountNameById.get(key) ?? 'Unknown account', debit: 0, credit: 0 };
      t.debit += line.debit;
      t.credit += line.credit;
      totalsByAccount.set(key, t);
    }
  }

  return res.status(200).json({
    range: { from, to },
    entries: entries.map((e) => serializeJournalEntry(e, accountNameById)),
    accountTotals: Array.from(totalsByAccount.entries())
      .map(([id, t]) => ({
        accountId: id,
        accountName: t.accountName,
        debit: Math.round(t.debit * 100) / 100,
        credit: Math.round(t.credit * 100) / 100,
        net: Math.round((t.debit - t.credit) * 100) / 100,
      }))
      .sort((a, b) => a.accountName.localeCompare(b.accountName)),
  });
}
