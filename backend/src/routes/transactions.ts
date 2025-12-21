import { Hono } from 'hono';
import {
  ncb,
  type Transaction,
  type TransactionShare,
  type TransactionShareOverride,
  type TransactionTag,
  type BurdenRatio,
  type BurdenRatioDetail,
} from '../lib/ncb.js';
import type { AuthUser } from '../middleware/auth.js';

const HOUSEHOLD_ID = 1; // TODO: Get from user context

const app = new Hono<{
  Variables: {
    user: AuthUser;
  };
}>();

/**
 * GET /api/transactions
 * Query params: year, month, includeTagged
 */
app.get('/', async (c) => {
  const year = c.req.query('year') || new Date().getFullYear().toString();
  const month = c.req.query('month') || (new Date().getMonth() + 1).toString().padStart(2, '0');
  const includeTagged = c.req.query('includeTagged') === 'true';

  const firstDay = `${year}-${month}-01`;
  const nextMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
  const nextYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
  const nextMonthFirstDay = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  // Fetch transactions for the month
  const rawTransactions = await ncb.list<Transaction>('transactions', {
    where: {
      household_id: HOUSEHOLD_ID,
      transaction_date: { _gte: firstDay },
    },
    order_by: { transaction_date: 'desc' },
    limit: 1000,
  });

  // Client-side date filtering (NCB API limitation workaround)
  let transactions = rawTransactions.filter(
    (tx) => tx.transaction_date >= firstDay && tx.transaction_date < nextMonthFirstDay
  );

  // Filter out tagged transactions if requested
  if (!includeTagged) {
    const transactionIds = transactions.map((tx) => tx.id);
    if (transactionIds.length > 0) {
      const transactionTags = await ncb.list<TransactionTag>('transaction_tags', {
        where: { transaction_id: { _in: transactionIds } },
      });
      const taggedIds = new Set(transactionTags.map((tt) => tt.transaction_id));
      transactions = transactions.filter((tx) => !taggedIds.has(tx.id));
    }
  }

  return c.json(transactions);
});

/**
 * GET /api/transactions/shares
 * Get transaction shares for given transaction IDs
 */
app.get('/shares', async (c) => {
  const idsParam = c.req.query('ids');
  if (!idsParam) {
    return c.json([]);
  }

  const ids = idsParam.split(',').map(Number).filter(Boolean);
  if (ids.length === 0) {
    return c.json([]);
  }

  // Batch IDs to avoid URL length issues
  const batchSize = 100;
  const allShares: TransactionShare[] = [];

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const shares = await ncb.list<TransactionShare>('transaction_shares', {
      where: { transaction_id: { _in: batch } },
    });
    allShares.push(...shares);
  }

  return c.json(allShares);
});

/**
 * GET /api/transactions/overrides
 * Get transaction share overrides for given transaction IDs
 */
app.get('/overrides', async (c) => {
  const idsParam = c.req.query('ids');
  if (!idsParam) {
    return c.json([]);
  }

  const ids = idsParam.split(',').map(Number).filter(Boolean);
  if (ids.length === 0) {
    return c.json([]);
  }

  const batchSize = 100;
  const allOverrides: TransactionShareOverride[] = [];

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const overrides = await ncb.list<TransactionShareOverride>('transaction_share_overrides', {
      where: { transaction_id: { _in: batch } },
    });
    allOverrides.push(...overrides);
  }

  return c.json(allOverrides);
});

/**
 * GET /api/transactions/tags
 * Get transaction tags for given transaction IDs
 */
app.get('/tags', async (c) => {
  const idsParam = c.req.query('ids');
  if (!idsParam) {
    return c.json([]);
  }

  const ids = idsParam.split(',').map(Number).filter(Boolean);
  if (ids.length === 0) {
    return c.json([]);
  }

  const batchSize = 100;
  const allTags: TransactionTag[] = [];

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const tags = await ncb.list<TransactionTag>('transaction_tags', {
      where: { transaction_id: { _in: batch } },
    });
    allTags.push(...tags);
  }

  return c.json(allTags);
});

/**
 * GET /api/transactions/burden-ratio
 * Get burden ratio for a specific month
 */
app.get('/burden-ratio', async (c) => {
  const year = c.req.query('year') || new Date().getFullYear().toString();
  const month = c.req.query('month') || (new Date().getMonth() + 1).toString().padStart(2, '0');
  const targetMonth = `${year}-${month}`;

  const ratios = await ncb.list<BurdenRatio>('burden_ratios', {
    where: {
      household_id: HOUSEHOLD_ID,
      target_month: targetMonth,
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
 * Get monthly summary (totals by category, user shares)
 */
app.get('/summary', async (c) => {
  const year = c.req.query('year') || new Date().getFullYear().toString();
  const month = c.req.query('month') || (new Date().getMonth() + 1).toString().padStart(2, '0');
  const includeTagged = c.req.query('includeTagged') === 'true';

  const firstDay = `${year}-${month}-01`;
  const nextMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
  const nextYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
  const nextMonthFirstDay = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  // Fetch transactions
  const rawTransactions = await ncb.list<Transaction>('transactions', {
    where: {
      household_id: HOUSEHOLD_ID,
      transaction_date: { _gte: firstDay },
    },
    limit: 1000,
  });

  let transactions = rawTransactions.filter(
    (tx) => tx.transaction_date >= firstDay && tx.transaction_date < nextMonthFirstDay
  );

  // Filter tagged if needed
  if (!includeTagged && transactions.length > 0) {
    const transactionIds = transactions.map((tx) => tx.id);
    const transactionTags = await ncb.list<TransactionTag>('transaction_tags', {
      where: { transaction_id: { _in: transactionIds } },
    });
    const taggedIds = new Set(transactionTags.map((tt) => tt.transaction_id));
    transactions = transactions.filter((tx) => !taggedIds.has(tx.id));
  }

  // Filter only household expenses (按分_家計)
  const householdTransactions = transactions.filter(
    (tx) => tx.processing_status === '按分_家計'
  );

  // Calculate total
  const totalSpending = householdTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  // Get shares for user breakdown
  const transactionIds = householdTransactions.map((tx) => tx.id);
  let userShares: Record<number, number> = {};

  if (transactionIds.length > 0) {
    const shares = await ncb.list<TransactionShare>('transaction_shares', {
      where: { transaction_id: { _in: transactionIds } },
    });

    const overrides = await ncb.list<TransactionShareOverride>('transaction_share_overrides', {
      where: { transaction_id: { _in: transactionIds } },
    });

    // Create override lookup
    const overrideMap = new Map<string, number>();
    overrides.forEach((o) => {
      overrideMap.set(`${o.transaction_id}-${o.user_id}`, o.amount);
    });

    // Calculate user totals (prefer overrides)
    shares.forEach((share) => {
      const key = `${share.transaction_id}-${share.user_id}`;
      const amount = overrideMap.has(key) ? overrideMap.get(key)! : share.amount;
      userShares[share.user_id] = (userShares[share.user_id] || 0) + amount;
    });
  }

  return c.json({
    totalSpending,
    userShares,
    transactionCount: householdTransactions.length,
  });
});

export default app;
