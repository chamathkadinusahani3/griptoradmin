import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { SupplierClaim, SupplierClaimDoc, SETTLEMENT_METHODS } from '../../models/SupplierClaim.js';
import { Supplier } from '../../models/Supplier.js';
import { PurchaseOrder, PurchaseOrderDoc } from '../../models/PurchaseOrder.js';
import { requireTenantPermission } from '../../auth.js';
import { postJournalEntry, getAccountIdsByNames, cashOrBankAccountName } from '../../journal.js';
import { serializeSupplierClaim } from '../../serializers.js';

interface UpdateSupplierClaimBody {
  action?: 'accept' | 'reject' | 'settle';
  amountSettled?: number;
  settlementMethod?: (typeof SETTLEMENT_METHODS)[number];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'complaints:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing supplier claim id' });

  const body = (req.body ?? {}) as UpdateSupplierClaimBody;
  if (!body.action || !['accept', 'reject', 'settle'].includes(body.action)) {
    return res.status(400).json({ error: 'action must be "accept", "reject", or "settle"' });
  }

  await connectToDatabase();

  const existing = (await SupplierClaim.findOne({ _id: id, clientId: session.clientId }).lean()) as SupplierClaimDoc | null;
  if (!existing) return res.status(404).json({ error: 'Supplier claim not found' });

  let update: Record<string, unknown>;
  if (body.action === 'accept') {
    if (existing.status !== 'Open') return res.status(400).json({ error: 'Only an Open claim can be accepted' });
    update = { status: 'Accepted' };
  } else if (body.action === 'reject') {
    if (existing.status !== 'Open') return res.status(400).json({ error: 'Only an Open claim can be rejected' });
    update = { status: 'Rejected' };
  } else {
    if (existing.status !== 'Accepted') return res.status(400).json({ error: 'Only an Accepted claim can be settled' });
    if (!body.amountSettled || body.amountSettled <= 0 || !body.settlementMethod) {
      return res.status(400).json({ error: 'A positive amountSettled and a settlementMethod are required' });
    }
    update = { status: 'Settled', amountSettled: body.amountSettled, settlementMethod: body.settlementMethod, settledAt: new Date() };
  }

  const claim = (await SupplierClaim.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    update,
    { returnDocument: 'after' }
  ).lean()) as SupplierClaimDoc;

  if (body.action === 'settle' && (body.settlementMethod === 'Cash' || body.settlementMethod === 'Bank Transfer')) {
    // Best-effort, same reasoning as every other non-transactional GL
    // posting in this codebase — mirrors the supplier-direction Return
    // refund entry from Phase 8 (reversing Cost of Goods Sold), since a
    // settled supplier claim is the same kind of event: money/credit
    // recovered from a supplier for a problem with what they delivered.
    try {
      const accountName = cashOrBankAccountName(body.settlementMethod);
      const accountIds = await getAccountIdsByNames(session.clientId, [accountName, 'Cost of Goods Sold']);
      const cashOrBankId = accountIds.get(accountName);
      const cogsId = accountIds.get('Cost of Goods Sold');
      if (cashOrBankId && cogsId) {
        await postJournalEntry({
          clientId: session.clientId,
          description: `Supplier claim settled — ${claim.claimNumber}`,
          sourceType: 'return-refund',
          sourceId: id,
          lines: [{ accountId: cashOrBankId, debit: claim.amountSettled! }, { accountId: cogsId, credit: claim.amountSettled! }],
        });
      }
    } catch (err) {
      console.error('Journal posting failed for supplier claim settlement', id, err);
    }
  }

  const supplier = (await Supplier.findById(claim.supplierId).select('name').lean()) as { name: string } | null;
  const order = claim.purchaseOrderId
    ? ((await PurchaseOrder.findById(claim.purchaseOrderId).select('poNumber').lean()) as PurchaseOrderDoc | null)
    : null;
  return res.status(200).json({ claim: serializeSupplierClaim(claim, supplier?.name, order?.poNumber) });
}
