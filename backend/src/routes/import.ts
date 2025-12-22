import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  ncb,
  type Transaction,
  type Category,
  type TransactionShare,
  type BurdenRatio,
  type BurdenRatioDetail,
  type User,
  type UserAlias,
  type ExclusionRule,
} from '../lib/ncb.js';
import { requireAdmin, type AuthUser } from '../middleware/auth.js';

// Validation schemas
const parseSchema = z.object({
  csvData: z.string().min(1),
});

const categorySchema = z.object({
  major_name: z.string().min(1),
  minor_name: z.string().min(1),
  cost_type: z.enum(['固定', '変動']),
});

const categoriesSchema = z.object({
  categories: z.array(categorySchema).min(1),
});

const parsedTransactionSchema = z.object({
  moneyforward_id: z.string().min(1),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  content: z.string(),
  amount: z.number(),
  major_name: z.string(),
  minor_name: z.string(),
  memo: z.string().nullable(),
  financial_institution: z.string(),
  is_calculation_target: z.boolean(),
  is_transfer: z.boolean(),
  processing_status: z.string(),
  applied_burden_ratio_id: z.number().nullable(),
  applied_exclusion_rule_id: z.number().nullable(),
});

const executeSchema = z.object({
  transactions: z.array(parsedTransactionSchema).min(1),
});

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
  financial_institution: string;
  is_calculation_target: boolean;
  is_transfer: boolean;
  processing_status: string;
  applied_burden_ratio_id: number | null;
  applied_exclusion_rule_id: number | null;
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
app.post('/parse', zValidator('json', parseSchema), async (c) => {
  const { csvData } = c.req.valid('json');

  // Parse CSV (MoneyForward format)
  const lines = csvData.split('\n').filter((line) => line.trim());
  if (lines.length < 2) {
    return c.json({ error: 'Invalid CSV format' }, 400);
  }

  // Get household context
  const user = c.get('user');
  const householdId = user.householdId;

  // Fetch master data for processing status logic
  const [users, userAliases, categories, exclusionRules, burdenRatios] = await Promise.all([
    ncb.list<User>('users', { where: { household_id: householdId } }),
    ncb.list<UserAlias>('user_aliases', {}),
    ncb.list<Category>('categories', { where: { household_id: householdId } }),
    ncb.list<ExclusionRule>('exclusion_rules', { where: { household_id: householdId } }),
    ncb.list<BurdenRatio>('burden_ratios', { where: { household_id: householdId } }),
  ]);

  // Build lookup maps
  const categoryMap = new Map(
    categories.map((c) => [`${c.major_name}|${c.minor_name}`, c])
  );
  const exclusionCategoryIds = new Set(exclusionRules.map((r) => r.category_id));
  const aliases = userAliases.filter((ua) => users.some((u) => u.id === ua.user_id));

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
      institution, // 保有金融機関
      majorName, // 大項目
      minorName, // 中項目
      memo, // メモ
      transfer, // 振替
      id, // ID
    ] = cols;

    // Skip duplicates
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const isCalculationTarget = calcTarget === '○';
    const isTransfer = transfer === '1' || transfer === 'true' || transfer === '○';
    const amount = parseInt(amountStr.replace(/,/g, ''), 10) || 0;

    // Parse date (YYYY/MM/DD -> YYYY-MM-DD)
    const dateParts = date.split('/');
    const isoDate =
      dateParts.length === 3
        ? `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`
        : date;

    // Determine processing_status (matches old app logic exactly)
    let processingStatus = '按分_家計';
    let appliedBurdenRatioId: number | null = null;
    let appliedExclusionRuleId: number | null = null;

    if (isTransfer) {
      processingStatus = '集計除外_振替';
    } else if (!isCalculationTarget) {
      processingStatus = '集計除外_計算対象外';
    } else {
      const memoText = memo || '';
      let found = false;

      // Check user aliases
      for (const userAlias of aliases) {
        if (memoText.startsWith(userAlias.alias)) {
          processingStatus = `按分_${userAlias.alias}`;
          found = true;
          break;
        }
      }

      // Check for 家計
      if (!found && memoText.startsWith('家計')) {
        processingStatus = '按分_家計';
        found = true;
      }

      // Check exclusion rules
      if (!found) {
        const category = categoryMap.get(`${majorName}|${minorName}`);
        if (category && exclusionCategoryIds.has(category.id)) {
          processingStatus = '集計除外_項目';
          const rule = exclusionRules.find((r) => r.category_id === category.id);
          appliedExclusionRuleId = rule?.id || null;
        }
      }

      // For 按分_家計, find burden ratio for transaction month
      if (processingStatus === '按分_家計') {
        const yearMonth = isoDate.substring(0, 7); // YYYY-MM
        const burdenRatio = burdenRatios.find((br) => br.effective_month === yearMonth);
        appliedBurdenRatioId = burdenRatio?.id || null;
      }
    }

    transactions.push({
      moneyforward_id: id,
      transaction_date: isoDate,
      content: (content && content.trim()) ? content : '（内容なし）',
      amount,
      major_name: majorName,
      minor_name: minorName,
      memo: memo || null,
      financial_institution: (institution && institution.trim()) ? institution : '（金融機関なし）',
      is_calculation_target: isCalculationTarget,
      is_transfer: isTransfer,
      processing_status: processingStatus,
      applied_burden_ratio_id: appliedBurdenRatioId,
      applied_exclusion_rule_id: appliedExclusionRuleId,
    });
  }

  // Check for existing transactions
  const existingIds = transactions.map((t) => t.moneyforward_id);
  const existing = await ncb.list<Transaction>('transactions', {
    where: { moneyforward_id: { _in: existingIds } },
  });
  const existingSet = new Set(existing.map((t) => t.moneyforward_id));

  // categorySet for checking new categories
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
app.post('/categories', zValidator('json', categoriesSchema), async (c) => {
  const user = c.get('user');
  const householdId = user.householdId;
  const { categories: cats } = c.req.valid('json');

  const categoriesToCreate = cats.map((cat) => ({
    household_id: householdId,
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
app.post('/execute', zValidator('json', executeSchema), async (c) => {
  const user = c.get('user');
  const householdId = user.householdId;
  const { transactions } = c.req.valid('json');

  // Get categories
  const categories = await ncb.list<Category>('categories', {
    where: { household_id: householdId },
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

  // Prepare transactions for upsert (with all fields from old app)
  const toUpsert: Partial<Transaction>[] = [];

  for (const tx of transactions) {
    const category = categoryMap.get(`${tx.major_name}|${tx.minor_name}`);

    toUpsert.push({
      household_id: householdId,
      moneyforward_id: tx.moneyforward_id,
      transaction_date: tx.transaction_date,
      content: tx.content,
      amount: tx.amount,
      financial_institution: tx.financial_institution,
      is_calculation_target: tx.is_calculation_target,
      is_transfer: tx.is_transfer,
      category_id: category?.id || null,
      memo: tx.memo,
      processing_status: tx.processing_status,
      applied_burden_ratio_id: tx.applied_burden_ratio_id,
      applied_exclusion_rule_id: tx.applied_exclusion_rule_id,
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

  // Calculate shares for all transactions (matching old app logic)
  const txsNeedingShares = transactions.filter(
    (tx) => tx.processing_status.startsWith('按分_')
  );

  if (txsNeedingShares.length > 0) {
    // Get users and user aliases
    const [users, userAliases, burdenRatios] = await Promise.all([
      ncb.list<User>('users', { where: { household_id: householdId } }),
      ncb.list<UserAlias>('user_aliases', {}),
      ncb.list<BurdenRatio>('burden_ratios', { where: { household_id: householdId } }),
    ]);

    const userAliasMap = new Map(userAliases.map((ua) => [ua.alias, ua.user_id]));

    // Get burden ratio details for all burden ratios
    const burdenRatioIds = burdenRatios.map((br) => br.id);
    const burdenRatioDetails = await ncb.list<BurdenRatioDetail>('burden_ratio_details', {
      where: { burden_ratio_id: { _in: burdenRatioIds } },
    });

    const shares: Partial<TransactionShare>[] = [];

    for (const tx of txsNeedingShares) {
      // Extract alias from processing_status if applicable
      const match = tx.processing_status.match(/^按分_(.+)$/);
      if (!match) continue;

      const target = match[1];
      const amount = tx.amount;

      if (target === '家計') {
        // Use burden_ratios for the transaction month
        const yearMonth = tx.transaction_date.substring(0, 7); // YYYY-MM
        const burdenRatio = burdenRatios.find((br) => br.effective_month === yearMonth);

        if (burdenRatio && users.length === 2) {
          const details = burdenRatioDetails.filter((d) => d.burden_ratio_id === burdenRatio.id);
          const user1 = users[0];
          const user2 = users[1];
          const user1Detail = details.find((d) => d.user_id === user1.id);

          const user1Percent = user1Detail ? user1Detail.ratio_percent : 50;
          const user1Share = Math.round(amount * (user1Percent / 100));

          shares.push({
            moneyforward_id: tx.moneyforward_id,
            user_id: user1.id,
            share_amount: user1Share,
          });
          shares.push({
            moneyforward_id: tx.moneyforward_id,
            user_id: user2.id,
            share_amount: amount - user1Share,
          });
        } else {
          // Fallback to 50/50
          const shareAmount = Math.round(amount / users.length);
          users.forEach((u, index) => {
            shares.push({
              moneyforward_id: tx.moneyforward_id,
              user_id: u.id,
              share_amount: (index === 0) ? amount - (shareAmount * (users.length - 1)) : shareAmount,
            });
          });
        }
      } else {
        // Individual attribution (按分_{alias})
        const userId = userAliasMap.get(target);
        if (userId) {
          shares.push({
            moneyforward_id: tx.moneyforward_id,
            user_id: userId,
            share_amount: amount,
          });
          // Set 0 for other users
          users.filter((u) => u.id !== userId).forEach((u) => {
            shares.push({
              moneyforward_id: tx.moneyforward_id,
              user_id: u.id,
              share_amount: 0,
            });
          });
        }
      }
    }

    // Create shares in batches
    for (let i = 0; i < shares.length; i += batchSize) {
      const batch = shares.slice(i, i + batchSize);
      await ncb.upsert('transaction_shares', batch, ['moneyforward_id', 'user_id']);
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
