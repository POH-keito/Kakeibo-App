import { Hono } from 'hono';
import {
  ncb,
  type Transaction,
  type Category,
  type TransactionShare,
  type BurdenRatio,
  type BurdenRatioDetail,
} from '../lib/ncb.js';
import { requireAdmin, type AuthUser } from '../middleware/auth.js';

const HOUSEHOLD_ID = 1;

const app = new Hono<{
  Variables: {
    user: AuthUser;
  };
}>();

// All import routes require admin
app.use('/*', requireAdmin);

interface ParsedTransaction {
  moneyforward_id: string;
  transaction_date: string;
  content: string;
  amount: number;
  major_name: string;
  minor_name: string;
  memo: string | null;
  is_excluded: boolean; // 計算対象が「○」以外
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  newCategories: { major_name: string; minor_name: string }[];
  transactions: ParsedTransaction[];
}

/**
 * POST /api/import/parse
 * Parse CSV data and return preview
 */
app.post('/parse', async (c) => {
  const body = await c.req.json<{ csvData: string }>();
  const { csvData } = body;

  // Parse CSV (MoneyForward format)
  const lines = csvData.split('\n').filter((line) => line.trim());
  if (lines.length < 2) {
    return c.json({ error: 'Invalid CSV format' }, 400);
  }

  // Skip header
  const transactions: ParsedTransaction[] = [];
  const seenIds = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 10) continue;

    const [
      calcTarget, // 計算対象
      date, // 日付
      content, // 内容
      amountStr, // 金額（円）
      _institution, // 保有金融機関
      majorName, // 大項目
      minorName, // 中項目
      memo, // メモ
      _transfer, // 振替
      id, // ID
    ] = cols;

    // Skip duplicates
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const isExcluded = calcTarget !== '○';
    const amount = parseInt(amountStr.replace(/,/g, ''), 10) || 0;

    // Parse date (YYYY/MM/DD -> YYYY-MM-DD)
    const dateParts = date.split('/');
    const isoDate =
      dateParts.length === 3
        ? `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`
        : date;

    transactions.push({
      moneyforward_id: id,
      transaction_date: isoDate,
      content,
      amount,
      major_name: majorName,
      minor_name: minorName,
      memo: memo || null,
      is_excluded: isExcluded,
    });
  }

  // Check for existing transactions
  const existingIds = transactions.map((t) => t.moneyforward_id);
  const existing = await ncb.list<Transaction>('transactions', {
    where: { moneyforward_id: { _in: existingIds } },
  });
  const existingSet = new Set(existing.map((t) => t.moneyforward_id));

  // Check for existing categories
  const categories = await ncb.list<Category>('categories', {
    where: { household_id: HOUSEHOLD_ID },
  });
  const categorySet = new Set(categories.map((c) => `${c.major_name}|${c.minor_name}`));

  // Find new categories
  const newCategories: { major_name: string; minor_name: string }[] = [];
  const seenCategories = new Set<string>();
  for (const tx of transactions) {
    const key = `${tx.major_name}|${tx.minor_name}`;
    if (!categorySet.has(key) && !seenCategories.has(key)) {
      newCategories.push({ major_name: tx.major_name, minor_name: tx.minor_name });
      seenCategories.add(key);
    }
  }

  // Count
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const tx of transactions) {
    if (existingSet.has(tx.moneyforward_id)) {
      updated++;
    } else {
      created++;
    }
  }

  return c.json({
    created,
    updated,
    skipped,
    newCategories,
    transactions,
  } as ImportResult);
});

/**
 * POST /api/import/categories
 * Create new categories
 */
app.post('/categories', async (c) => {
  const body = await c.req.json<{
    categories: { major_name: string; minor_name: string; cost_type: string }[];
  }>();

  const categoriesToCreate = body.categories.map((cat) => ({
    household_id: HOUSEHOLD_ID,
    major_name: cat.major_name,
    minor_name: cat.minor_name,
    cost_type: cat.cost_type,
  }));

  const created = await ncb.create<Category>('categories', categoriesToCreate);

  return c.json({ created: created.length });
});

/**
 * POST /api/import/execute
 * Execute the import
 */
app.post('/execute', async (c) => {
  const body = await c.req.json<{ transactions: ParsedTransaction[] }>();
  const { transactions } = body;

  // Get categories
  const categories = await ncb.list<Category>('categories', {
    where: { household_id: HOUSEHOLD_ID },
  });
  const categoryMap = new Map(
    categories.map((c) => [`${c.major_name}|${c.minor_name}`, c])
  );

  // Get existing transactions
  const existingIds = transactions.map((t) => t.moneyforward_id);
  const existing = await ncb.list<Transaction>('transactions', {
    where: { moneyforward_id: { _in: existingIds } },
  });
  const existingMap = new Map(existing.map((t) => [t.moneyforward_id, t]));

  // Prepare transactions for upsert
  const toUpsert: Partial<Transaction>[] = [];

  for (const tx of transactions) {
    const category = categoryMap.get(`${tx.major_name}|${tx.minor_name}`);

    // Determine processing status
    let processingStatus = '按分_家計';
    if (tx.is_excluded) {
      processingStatus = '集計除外_計算対象外';
    }
    // TODO: Add more rules for individual attribution

    toUpsert.push({
      household_id: HOUSEHOLD_ID,
      moneyforward_id: tx.moneyforward_id,
      transaction_date: tx.transaction_date,
      content: tx.content,
      amount: tx.amount,
      category_id: category?.id || null,
      processing_status: processingStatus,
      memo: tx.memo,
    });
  }

  // Upsert in batches
  const batchSize = 50;
  let created = 0;
  let updated = 0;

  for (let i = 0; i < toUpsert.length; i += batchSize) {
    const batch = toUpsert.slice(i, i + batchSize);
    await ncb.upsert('transactions', batch, ['moneyforward_id']);

    // Count created vs updated
    for (const tx of batch) {
      if (existingMap.has(tx.moneyforward_id!)) {
        updated++;
      } else {
        created++;
      }
    }
  }

  // Calculate shares for new transactions
  const newTxIds = transactions
    .filter((tx) => !existingMap.has(tx.moneyforward_id) && !tx.is_excluded)
    .map((tx) => tx.moneyforward_id);

  if (newTxIds.length > 0) {
    // Get the transactions we just created
    const newTransactions = await ncb.list<Transaction>('transactions', {
      where: { moneyforward_id: { _in: newTxIds } },
    });

    // Group by month and calculate shares
    const byMonth = new Map<string, Transaction[]>();
    for (const tx of newTransactions) {
      const month = tx.transaction_date.substring(0, 7); // YYYY-MM
      if (!byMonth.has(month)) {
        byMonth.set(month, []);
      }
      byMonth.get(month)!.push(tx);
    }

    // Get burden ratios for each month
    const shares: Partial<TransactionShare>[] = [];
    for (const [month, txs] of byMonth) {
      const ratios = await ncb.list<BurdenRatio>('burden_ratios', {
        where: { household_id: HOUSEHOLD_ID, target_month: month },
      });

      if (ratios.length === 0) continue;

      const ratioDetails = await ncb.list<BurdenRatioDetail>('burden_ratio_details', {
        where: { burden_ratio_id: ratios[0].id },
      });

      for (const tx of txs) {
        for (const detail of ratioDetails) {
          shares.push({
            transaction_id: tx.id,
            user_id: detail.user_id,
            amount: Math.round(Math.abs(tx.amount) * (detail.percentage / 100)),
          });
        }
      }
    }

    // Create shares in batches
    for (let i = 0; i < shares.length; i += batchSize) {
      const batch = shares.slice(i, i + batchSize);
      await ncb.upsert('transaction_shares', batch, ['transaction_id', 'user_id']);
    }
  }

  return c.json({ created, updated });
});

// Helper function to parse CSV line (handles quoted fields)
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

export default app;
