import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../db.js';
import { StockIssue, StockIssueDoc } from '../../models/StockIssue.js';
import { Part } from '../../models/Part.js';
import { Department, DepartmentDoc } from '../../models/Department.js';
import { requireTenantPermission } from '../../auth.js';
import { resolveBranchFilter } from '../../branch.js';
import { isValidWarehouse } from '../../warehouse.js';
import { generateSequentialNumber } from '../../numbering.js';
import { serializeStockIssue } from '../../serializers.js';
import { postJournalEntry, getAccountIdsByNames } from '../../journal.js';

interface StockIssueLineBody {
  partId?: string;
  quantity?: number;
}

interface CreateStockIssueBody {
  branchId?: string;
  warehouseId?: string;
  items?: StockIssueLineBody[];
  issuedTo?: string;
  departmentId?: string;
  notes?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function withNames(clientId: string, issues: StockIssueDoc[]) {
  if (issues.length === 0) return [];
  const departmentIds = [...new Set(issues.map((i) => i.departmentId?.toString()).filter((id): id is string => !!id))];
  const departments = departmentIds.length > 0 ? ((await Department.find({ _id: { $in: departmentIds }, clientId }).select('name').lean()) as DepartmentDoc[]) : [];
  const nameById = new Map(departments.map((d) => [d._id.toString(), d.name]));
  return issues.map((i) => serializeStockIssue(i, i.departmentId ? nameById.get(i.departmentId.toString()) : undefined));
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'stock-issues:view');
  if (!session) return;

  await connectToDatabase();
  const { branchId, warehouseId } = req.query;
  const effectiveBranchId = resolveBranchFilter(session, typeof branchId === 'string' ? branchId : undefined);
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (effectiveBranchId) filter.branchId = effectiveBranchId;
  if (typeof warehouseId === 'string') filter.warehouseId = warehouseId;

  const issues = (await StockIssue.find(filter).sort({ createdAt: -1 }).lean()) as StockIssueDoc[];
  return res.status(200).json({ stockIssues: await withNames(session.clientId, issues) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'stock-issues:manage');
  if (!session) return;

  const { branchId: requestedBranchId, warehouseId, items, issuedTo, departmentId, notes } = (req.body ?? {}) as CreateStockIssueBody;

  if (!issuedTo?.trim()) return res.status(400).json({ error: 'issuedTo is required' });
  if (!items || items.length === 0) return res.status(400).json({ error: 'At least one item is required' });
  const requestedLines: { partId: string; quantity: number }[] = [];
  for (const line of items) {
    if (!line.partId || !line.quantity || line.quantity <= 0) {
      return res.status(400).json({ error: 'Each item requires a partId and a positive quantity' });
    }
    requestedLines.push({ partId: line.partId, quantity: line.quantity });
  }

  await connectToDatabase();

  const branchId = resolveBranchFilter(session, requestedBranchId);
  if (warehouseId && !(await isValidWarehouse(session.clientId, warehouseId))) {
    return res.status(400).json({ error: 'Unknown warehouse' });
  }
  if (departmentId) {
    const department = await Department.findOne({ _id: departmentId, clientId: session.clientId }).lean();
    if (!department) return res.status(400).json({ error: 'Unknown department' });
  }

  const dbSession = await mongoose.startSession();
  try {
    let created: StockIssueDoc | undefined;
    await dbSession.withTransaction(async () => {
      const lines: { partId: string; name: string; quantity: number; unitPrice: number }[] = [];
      for (const line of requestedLines) {
        const part = await Part.findOneAndUpdate(
          { _id: line.partId, clientId: session.clientId, stock: { $gte: line.quantity } },
          { $inc: { stock: -line.quantity } },
          { session: dbSession }
        );
        if (!part) {
          throw Object.assign(new Error(`Not enough stock to issue ${line.quantity} of this part`), { statusCode: 400 });
        }
        lines.push({ partId: line.partId, name: part.name, quantity: line.quantity, unitPrice: part.price });
      }

      const totalValue = Math.round(lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0) * 100) / 100;
      const stockIssueNumber = await generateSequentialNumber(StockIssue, session.clientId, 'stockIssueNumber', 'stockIssue');

      const [issue] = await StockIssue.create(
        [
          {
            clientId: session.clientId,
            stockIssueNumber,
            branchId: branchId || undefined,
            warehouseId: warehouseId || undefined,
            items: lines,
            totalValue,
            issuedTo: issuedTo.trim(),
            departmentId: departmentId || undefined,
            notes,
          },
        ],
        { session: dbSession }
      );
      created = issue.toObject() as StockIssueDoc;
    });

    // Best-effort, outside the stock-decrement transaction (same reasoning
    // as every other GL posting call site) — parts leaving for internal use
    // are a real expense-in-kind: Dr the Parts & Supplies Expense account
    // (already seeded for Expense.ts's own 'Parts & Supplies' category),
    // Cr Inventory.
    try {
      const accountIds = await getAccountIdsByNames(session.clientId, ['Parts & Supplies Expense', 'Inventory']);
      const expenseId = accountIds.get('Parts & Supplies Expense');
      const inventoryId = accountIds.get('Inventory');
      if (expenseId && inventoryId && created) {
        await postJournalEntry({
          clientId: session.clientId,
          description: `Stock issued — ${created.stockIssueNumber} (${created.issuedTo})`,
          sourceType: 'expense',
          sourceId: created._id.toString(),
          lines: [{ accountId: expenseId, debit: created.totalValue }, { accountId: inventoryId, credit: created.totalValue }],
        });
      }
    } catch (err) {
      console.error('Journal posting failed for stock issue', created?._id.toString(), err);
    }

    if (!created) throw new Error('Transaction completed without producing a result');
    const [serialized] = await withNames(session.clientId, [created]);
    return res.status(201).json({ stockIssue: serialized });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : 'Failed to record stock issue';
    return res.status(statusCode).json({ error: message });
  } finally {
    await dbSession.endSession();
  }
}
