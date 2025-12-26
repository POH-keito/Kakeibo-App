import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  ncb,
  parallelBatchFetch,
  type Transaction,
  type TransactionShare,
  type TransactionShareOverride,
  type TransactionTag,
  type BurdenRatio,
  type BurdenRatioDetail,
  type Category,
  type User,
} from '../lib/ncb.js';
import type { AuthUser } from '../middleware/auth.js';
import { calculateShares } from '../lib/business-logic.js';

// Validation schemas
const yearMonthQuerySchema = z.object({
  year: z.string().regex(/^\d{4}$/).optional(),
  month: z.string().regex(/^(0[1-9]|1[0-2])$/).optional(),
  includeTagged: z.enum(['true', 'false']).optional(),
});

const app = new Hono<{
  Variables: {
    user: AuthUser;
  };
}>();

/**
 * GET /api/transactions
 * Query params: year, month, includeTagged
 */
app.get('/', zValidator('query', yearMonthQuerySchema), async (c) => {
  const user = c.get('user');
  const householdId = user.householdId;
  const query = c.req.valid('query');

  const year = query.year || new Date().getFullYear().toString();
  const month = query.month || (new Date().getMonth() + 1).toString().padStart(2, '0');
  const includeTagged = query.includeTagged === 'true';

  const firstDay = `${year}-${month}-01`;
  const nextMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
  const nextYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
  const nextMonthFirstDay = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  // Fetch transactions for the month
  const rawTransactions = await ncb.list<Transaction>('transactions', {
    where: {
      household_id: householdId,
      transaction_date: { _gte: firstDay, _lt: nextMonthFirstDay },
    },
    order_by: { transaction_date: 'desc' },
    limit: 1000,
  });

  // Client-side date filtering kept for safety
  let transactions = rawTransactions.filter(
    (tx) => tx.transaction_date >= firstDay && tx.transaction_date < nextMonthFirstDay
  );

  // Filter out tagged transactions if requested
  if (!includeTagged) {
    const moneyforwardIds = transactions.map((tx) => tx.moneyforward_id.trim());
    if (moneyforwardIds.length > 0) {
      // Batch the IDs to avoid URL length issues (NCB has ~2000 char limit)
      const batchSize = 50;
      const batches: string[][] = [];
      for (let i = 0; i < moneyforwardIds.length; i += batchSize) {
        batches.push(moneyforwardIds.slice(i, i + batchSize));
      }

      const allTags = await parallelBatchFetch(batches, (batch) =>
        ncb.list<TransactionTag>('transaction_tags', {
          where: { moneyforward_id: { _in: batch } },
        })
      );

      const taggedMfIds = new Set(allTags.map((tt) => tt.moneyforward_id.trim()));
      transactions = transactions.filter((tx) => !taggedMfIds.has(tx.moneyforward_id.trim()));
    }
  }

  return c.json(transactions);
});

/**
 * GET /api/transactions/shares
 * Get transaction shares for given moneyforward IDs
 */
app.get('/shares', async (c) => {
  const idsParam = c.req.query('ids');
  if (!idsParam) {
    return c.json([]);
  }

  const moneyforwardIds = idsParam.split(',').map((id) => id.trim()).filter(Boolean);
  if (moneyforwardIds.length === 0) {
    return c.json([]);
  }

  // Batch IDs to avoid URL length issues
  const batchSize = 50;
  const batches: string[][] = [];
  for (let i = 0; i < moneyforwardIds.length; i += batchSize) {
    batches.push(moneyforwardIds.slice(i, i + batchSize));
  }

  const allShares = await parallelBatchFetch(batches, (batch) =>
    ncb.list<TransactionShare>('transaction_shares', {
      where: { moneyforward_id: { _in: batch } },
    })
  );

  return c.json(allShares);
});

/**
 * GET /api/transactions/overrides
 * Get transaction share overrides for given moneyforward IDs
 */
app.get('/overrides', async (c) => {
  const idsParam = c.req.query('ids');
  if (!idsParam) {
    return c.json([]);
  }

  const moneyforwardIds = idsParam.split(',').map((id) => id.trim()).filter(Boolean);
  if (moneyforwardIds.length === 0) {
    return c.json([]);
  }

  const batchSize = 50;
  const batches: string[][] = [];
  for (let i = 0; i < moneyforwardIds.length; i += batchSize) {
    batches.push(moneyforwardIds.slice(i, i + batchSize));
  }

  const allOverrides = await parallelBatchFetch(batches, (batch) =>
    ncb.list<TransactionShareOverride>('transaction_share_overrides', {
      where: { moneyforward_id: { _in: batch } },
    })
  );

  return c.json(allOverrides);
});

/**
 * GET /api/transactions/tags
 * Get transaction tags for given moneyforward IDs
 */
app.get('/tags', async (c) => {
  const idsParam = c.req.query('ids');
  if (!idsParam) {
    return c.json([]);
  }

  const moneyforwardIds = idsParam.split(',').map((id) => id.trim()).filter(Boolean);
  if (moneyforwardIds.length === 0) {
    return c.json([]);
  }

  const batchSize = 50;
  const batches: string[][] = [];
  for (let i = 0; i < moneyforwardIds.length; i += batchSize) {
    batches.push(moneyforwardIds.slice(i, i + batchSize));
  }

  const allTags = await parallelBatchFetch(batches, (batch) =>
    ncb.list<TransactionTag>('transaction_tags', {
      where: { moneyforward_id: { _in: batch } },
    })
  );

  return c.json(allTags);
});

/**
 * GET /api/transactions/burden-ratio
 * Get burden ratio for a specific month
 */
app.get('/burden-ratio', async (c) => {
  const user = c.get('user');
  const householdId = user.householdId;

  const year = c.req.query('year') || new Date().getFullYear().toString();
  const month = c.req.query('month') || (new Date().getMonth() + 1).toString().padStart(2, '0');
  const effectiveMonth = `${year}-${month}`;

  const ratios = await ncb.list<BurdenRatio>('burden_ratios', {
    where: {
      household_id: householdId,
      effective_month: effectiveMonth,
    },
  });

  if (ratios.length === 0) {
    return c.json(null);
  }

  const ratioDetails = await ncb.list<BurdenRatioDetail>('burden_ratio_details', {
    where: { burden_ratio_id: ratios[0].id },
  });

  return c.json({
    ...ratios[0],
    details: ratioDetails,
  });
});

/**
 * GET /api/transactions/summary
 * Get monthly summary (totals by category, cost type, user shares)
 * Business logic moved from frontend (comparison.tsx, index.tsx)
 */
app.get('/summary', zValidator('query', yearMonthQuerySchema), async (c) => {
  const user = c.get('user');
  const householdId = user.householdId;
  const query = c.req.valid('query');

  const year = query.year || new Date().getFullYear().toString();
  const month = query.month || (new Date().getMonth() + 1).toString().padStart(2, '0');
  const includeTagged = query.includeTagged === 'true';

  const firstDay = `${year}-${month}-01`;
  const nextMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
  const nextYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
  const nextMonthFirstDay = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  // Fetch master data in parallel
  const [rawTransactions, categories, users, burdenRatios, burdenRatioDetails] = await Promise.all([
    ncb.list<Transaction>('transactions', {
      where: {
        household_id: householdId,
        transaction_date: { _gte: firstDay, _lt: nextMonthFirstDay },
      },
      limit: 1000,
    }),
    ncb.list<Category>('categories', { where: { household_id: householdId } }),
    ncb.list<User>('users', { where: { household_id: householdId } }),
    ncb.list<BurdenRatio>('burden_ratios', { where: { household_id: householdId } }),
    ncb.list<BurdenRatioDetail>('burden_ratio_details', {}),
  ]);

  let transactions = rawTransactions.filter(
    (tx) => tx.transaction_date >= firstDay && tx.transaction_date < nextMonthFirstDay
  );

  // Filter tagged if needed
  if (!includeTagged && transactions.length > 0) {
    const moneyforwardIds = transactions.map((tx) => tx.moneyforward_id.trim());
    const batchSize = 50;
    const batches: string[][] = [];
    for (let i = 0; i < moneyforwardIds.length; i += batchSize) {
      batches.push(moneyforwardIds.slice(i, i + batchSize));
    }

    const allTags = await parallelBatchFetch(batches, (batch) =>
      ncb.list<TransactionTag>('transaction_tags', {
        where: { moneyforward_id: { _in: batch } },
      })
    );

    const taggedMfIds = new Set(allTags.map((tt) => tt.moneyforward_id.trim()));
    transactions = transactions.filter((tx) => !taggedMfIds.has(tx.moneyforward_id.trim()));
  }

  // Create category map for cost type lookup
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  // Filter transactions for summary:
  // - 按分_家計 for main household expenses
  // - 立替 for tatekae tracking
  const relevantTransactions = transactions.filter((tx) => {
    if (tx.processing_status === '按分_家計') return true;
    // Check if it's a tatekae transaction
    const cat = tx.category_id ? categoryMap.get(tx.category_id) : null;
    if (cat?.cost_type === '立替') return true;
    return false;
  });

  // Get shares and overrides for user breakdown
  const moneyforwardIds = relevantTransactions.map((tx) => tx.moneyforward_id.trim());
  let sharesMap = new Map<string, TransactionShare[]>();
  let overridesMap = new Map<string, TransactionShareOverride[]>();

  if (moneyforwardIds.length > 0) {
    const batchSize = 50;
    const batches: string[][] = [];
    for (let i = 0; i < moneyforwardIds.length; i += batchSize) {
      batches.push(moneyforwardIds.slice(i, i + batchSize));
    }

    const [shares, overrides] = await Promise.all([
      parallelBatchFetch(batches, (batch) =>
        ncb.list<TransactionShare>('transaction_shares', {
          where: { moneyforward_id: { _in: batch } },
        })
      ),
      parallelBatchFetch(batches, (batch) =>
        ncb.list<TransactionShareOverride>('transaction_share_overrides', {
          where: { moneyforward_id: { _in: batch } },
        })
      ),
    ]);

    // Group by moneyforward_id
    shares.forEach((s) => {
      const key = s.moneyforward_id.trim();
      if (!sharesMap.has(key)) sharesMap.set(key, []);
      sharesMap.get(key)!.push(s);
    });
    overrides.forEach((o) => {
      const key = o.moneyforward_id.trim();
      if (!overridesMap.has(key)) overridesMap.set(key, []);
      overridesMap.get(key)!.push(o);
    });
  }

  // Calculate summary using business logic
  const byCategory: Record<string, number> = {};
  const byCostType: Record<string, number> = {};
  const byCostTypeHierarchy: Record<string, { total: number; byMajor: Record<string, { total: number; byMinor: Record<string, number> }> }> = {
    '固定': { total: 0, byMajor: {} },
    '変動': { total: 0, byMajor: {} },
  };
  const userShares: Record<number, number> = {};
  const userTatekae: Record<number, number> = {};

  // Initialize user shares and tatekae
  users.forEach((u) => {
    userShares[u.id] = 0;
    userTatekae[u.id] = 0;
  });

  // Build user alias map for share calculation
  const userAliasMap = new Map<number, string>();

  let householdCount = 0;

  for (const tx of relevantTransactions) {
    const category = tx.category_id ? categoryMap.get(tx.category_id) : undefined;
    const costType = category?.cost_type || '変動';
    const majorName = category?.major_name || '未分類';
    const minorName = category?.minor_name || '未分類';
    const mfId = tx.moneyforward_id.trim();

    // Calculate shares using business logic
    const txShares = sharesMap.get(mfId) || [];
    const txOverrides = overridesMap.get(mfId) || [];

    const shareResult = calculateShares({
      amount: Math.abs(tx.amount),
      processingStatus: tx.processing_status,
      transactionDate: tx.transaction_date,
      users: users.map((u) => ({ id: u.id, name: u.name })),
      userAliasMap,
      burdenRatios: burdenRatios.map((br) => ({
        id: br.id,
        effectiveMonth: br.effective_month,
      })),
      burdenRatioDetails: burdenRatioDetails.map((d) => ({
        burdenRatioId: d.burden_ratio_id,
        userId: d.user_id,
        ratioPercent: d.ratio_percent,
      })),
      existingShares: txShares.map((s) => ({
        userId: s.user_id,
        shareAmount: s.share_amount,
      })),
      overrides: txOverrides.map((o) => ({
        userId: o.user_id,
        value: o.value,
        overrideType: o.override_type as 'PERCENT' | 'FIXED_AMOUNT',
      })),
    });

    // Handle Tatekae (立替) separately
    if (costType === '立替') {
      // Find the payer (user with positive share amount)
      const payer = shareResult.shares.find((s) => s.amount > 0);
      if (payer) {
        userTatekae[payer.userId] = (userTatekae[payer.userId] || 0) + Math.abs(tx.amount);
      }
      // Add negative shares to userShares (the amount owed)
      for (const share of shareResult.shares) {
        if (share.amount > 0) continue;
        userShares[share.userId] = (userShares[share.userId] || 0) + share.amount;
      }
      continue;
    }

    // Only process 按分_家計 for main summary
    if (tx.processing_status !== '按分_家計') continue;

    householdCount++;
    const amount = Math.abs(tx.amount);

    // By major category
    byCategory[majorName] = (byCategory[majorName] || 0) + amount;

    // By cost type (flat)
    byCostType[costType] = (byCostType[costType] || 0) + amount;

    // By cost type hierarchy (3-level)
    if (costType === '固定' || costType === '変動') {
      const costGroup = byCostTypeHierarchy[costType];
      costGroup.total += amount;

      if (!costGroup.byMajor[majorName]) {
        costGroup.byMajor[majorName] = { total: 0, byMinor: {} };
      }
      costGroup.byMajor[majorName].total += amount;
      costGroup.byMajor[majorName].byMinor[minorName] =
        (costGroup.byMajor[majorName].byMinor[minorName] || 0) + amount;
    }

    // Sum up user shares
    for (const share of shareResult.shares) {
      userShares[share.userId] = (userShares[share.userId] || 0) + share.amount;
    }
  }

  const totalSpending = Object.values(byCategory).reduce((a, b) => a + b, 0);

  return c.json({
    totalSpending,
    byCategory,
    byCostType,
    byCostTypeHierarchy,
    userShares,
    userTatekae,
    transactionCount: householdCount,
  });
});

/**
 * GET /api/transactions/cost-trend
 * Get cost type trends over multiple months
 * Query params: months (default: 6)
 */
app.get('/cost-trend', async (c) => {
  const user = c.get('user');
  const householdId = user.householdId;

  const monthsParam = c.req.query('months') || '6';
  const months = parseInt(monthsParam);

  const now = new Date();
  const trends: Array<{
    month: string;
    固定費: number;
    変動費: number;
    その他: number;
  }> = [];

  // Fetch all categories once
  const categories = await ncb.list<Category>('categories', {
    where: { household_id: householdId },
  });
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  // Generate months array (current month + previous months)
  for (let i = 0; i < months; i++) {
    const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth() + 1;
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonthFirstDay = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    // Fetch transactions for the month
    const rawTransactions = await ncb.list<Transaction>('transactions', {
      where: {
        household_id: householdId,
        transaction_date: { _gte: firstDay, _lt: nextMonthFirstDay },
      },
      limit: 1000,
    });

    const transactions = rawTransactions.filter(
      (tx) =>
        tx.transaction_date >= firstDay &&
        tx.transaction_date < nextMonthFirstDay &&
        tx.processing_status === '按分_家計'
    );

    // Calculate cost type totals
    const costTypes: Record<string, number> = {
      '固定費': 0,
      '変動費': 0,
      'その他': 0,
    };

    transactions.forEach((tx) => {
      const category = categoryMap.get(tx.category_id || 0);
      const costType = category?.cost_type || 'その他';
      const amount = Math.abs(tx.amount);

      if (costType === '固定費' || costType === '変動費') {
        costTypes[costType] += amount;
      } else {
        costTypes['その他'] += amount;
      }
    });

    trends.unshift({
      month: monthStr,
      固定費: costTypes['固定費'],
      変動費: costTypes['変動費'],
      その他: costTypes['その他'],
    });
  }

  return c.json(trends);
});

/**
 * GET /api/transactions/export
 * Export transactions as CSV (UTF-8 with BOM for Excel compatibility)
 */
app.get('/export', async (c) => {
  const user = c.get('user');
  const householdId = user.householdId;

  const year = c.req.query('year') || new Date().getFullYear().toString();
  const month = c.req.query('month') || (new Date().getMonth() + 1).toString().padStart(2, '0');

  const firstDay = `${year}-${month}-01`;
  const nextMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
  const nextYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
  const nextMonthFirstDay = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  // Fetch transactions for the month
  const rawTransactions = await ncb.list<Transaction>('transactions', {
    where: {
      household_id: householdId,
      transaction_date: { _gte: firstDay, _lt: nextMonthFirstDay },
    },
    order_by: { transaction_date: 'desc' },
    limit: 1000,
  });

  const transactions = rawTransactions.filter(
    (tx) => tx.transaction_date >= firstDay && tx.transaction_date < nextMonthFirstDay
  );

  // Fetch all categories
  const categories = await ncb.list<Category>('categories', {
    where: { household_id: householdId },
  });
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  // Fetch transaction shares
  const moneyforwardIds = transactions.map((tx) => tx.moneyforward_id.trim());
  const allShares: TransactionShare[] = [];
  const allTags: TransactionTag[] = [];

  if (moneyforwardIds.length > 0) {
    const batchSize = 50;
    const batches: string[][] = [];
    for (let i = 0; i < moneyforwardIds.length; i += batchSize) {
      batches.push(moneyforwardIds.slice(i, i + batchSize));
    }

    const [shares, tags] = await Promise.all([
      parallelBatchFetch(batches, (batch) =>
        ncb.list<TransactionShare>('transaction_shares', {
          where: { moneyforward_id: { _in: batch } },
        })
      ),
      parallelBatchFetch(batches, (batch) =>
        ncb.list<TransactionTag>('transaction_tags', {
          where: { moneyforward_id: { _in: batch } },
        })
      ),
    ]);

    allShares.push(...shares);
    allTags.push(...tags);
  }

  // Create lookup maps
  const sharesMap = new Map<string, TransactionShare[]>();
  allShares.forEach((share) => {
    const key = share.moneyforward_id.trim();
    if (!sharesMap.has(key)) {
      sharesMap.set(key, []);
    }
    sharesMap.get(key)!.push(share);
  });

  const tagsMap = new Map<string, number>();
  allTags.forEach((tag) => {
    tagsMap.set(tag.moneyforward_id.trim(), tag.tag_id);
  });

  // CSV header
  const csvRows: string[] = [
    '日付,内容,金額,大項目,中項目,費用種別,処理ステータス,按分情報,タグ,メモ',
  ];

  // CSV rows
  for (const tx of transactions) {
    const category = tx.category_id ? categoryMap.get(tx.category_id) : null;
    const shares = sharesMap.get(tx.moneyforward_id.trim()) || [];
    const hasTag = tagsMap.has(tx.moneyforward_id.trim());

    // Build share info
    let shareInfo = '';
    if (shares.length > 0) {
      shareInfo = shares.map((s) => `User${s.user_id}:¥${s.share_amount}`).join(' / ');
    }

    const row = [
      tx.transaction_date,
      escapeCsvValue(tx.content),
      tx.amount.toString(),
      category ? escapeCsvValue(category.major_name) : '',
      category ? escapeCsvValue(category.minor_name) : '',
      category?.cost_type || '',
      escapeCsvValue(tx.processing_status),
      escapeCsvValue(shareInfo),
      hasTag ? 'タグ付き' : '',
      escapeCsvValue(tx.memo || ''),
    ];

    csvRows.push(row.join(','));
  }

  const csvContent = csvRows.join('\n');

  // Add UTF-8 BOM for Excel compatibility
  const bom = '\uFEFF';
  const csvWithBom = bom + csvContent;

  const filename = `transactions_${year}-${month}.csv`;

  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="${filename}"`);

  return c.text(csvWithBom);
});

/**
 * Escape CSV values (handle quotes and commas)
 */
function escapeCsvValue(value: string): string {
  if (!value) return '';

  // If value contains comma, quote, or newline, wrap in quotes and escape quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

export default app;
