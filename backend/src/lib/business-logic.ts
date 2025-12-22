/**
 * Business Logic Module
 *
 * This module contains all core business logic for the Kakeibo app,
 * migrated from the frontend for better type safety and maintainability.
 *
 * Reference: Kakeibo-Batch-Processor/src/services/transactionProcessor.ts
 */

// ============================================================
// Types
// ============================================================

export interface DetermineStatusParams {
  isTransfer: boolean;
  isCalculationTarget: boolean;
  memo: string | null;
  majorName: string;
  minorName: string;
  userAliases: string[];
  exclusionRules: { majorName: string; minorName: string; id: number }[];
}

export interface StatusResult {
  status: string;
  targetUserAlias?: string;
  appliedExclusionRuleId?: number;
}

export interface User {
  id: number;
  name: string;
}

export interface BurdenRatio {
  id: number;
  effectiveMonth: string;
}

export interface BurdenRatioDetail {
  burdenRatioId: number;
  userId: number;
  ratioPercent: number;
}

export interface ExistingShare {
  userId: number;
  shareAmount: number;
}

export interface Override {
  userId: number;
  value: number;
  overrideType: 'PERCENT' | 'FIXED_AMOUNT';
}

export interface ShareResult {
  userId: number;
  amount: number;
  percent: number;
}

export interface CalculateSharesResult {
  shares: ShareResult[];
  appliedBurdenRatioId: number | null;
  hasOverrides: boolean;
  source: 'override' | 'existing' | 'calculated' | 'none';
  sharesColor: string;
}

export interface CalculateSharesParams {
  amount: number;
  processingStatus: string;
  transactionDate: string;
  users: User[];
  userAliasMap: Map<number, string>;
  burdenRatios: BurdenRatio[];
  burdenRatioDetails: BurdenRatioDetail[];
  existingShares?: ExistingShare[];
  overrides?: Override[];
}

export interface Category {
  id: number;
  majorName: string;
  minorName: string;
  costType: string;
}

export interface EnrichedTransaction {
  id: number;
  moneyforwardId: string;
  transactionDate: string;
  content: string;
  amount: number;
  categoryId: number | null;
  processingStatus: string;
  memo: string | null;
}

export interface MonthlySummary {
  totalSpending: number;
  byCategory: Record<string, number>;
  byCostType: Record<string, number>;
  userShares: Record<number, number>;
  transactionCount: number;
}

// ============================================================
// Constants
// ============================================================

const COLORS = {
  OVERRIDE: '#c53030',    // Red - manual override
  EXISTING: '#4a5568',    // Gray - existing shares
  DEFAULT: '#38a169',     // Green - default ratio
  NONE: '#718096',        // Light gray - no shares
} as const;

// ============================================================
// Processing Status Determination
// ============================================================

/**
 * Determine the processing status for a transaction.
 *
 * Priority order (from transactionProcessor.ts:9-27):
 * 1. Transfer (振替) -> '集計除外_振替'
 * 2. Not calculation target (計算対象外) -> '集計除外_計算対象外'
 * 3. Memo starts with user alias -> '按分_{alias}'
 * 4. Memo starts with '家計' -> '按分_家計'
 * 5. Category matches exclusion rule -> '集計除外_項目'
 * 6. Default -> '按分_家計'
 */
export function determineProcessingStatus(params: DetermineStatusParams): StatusResult {
  const {
    isTransfer,
    isCalculationTarget,
    memo,
    majorName,
    minorName,
    userAliases,
    exclusionRules,
  } = params;

  // 1. Transfer is excluded
  if (isTransfer) {
    return { status: '集計除外_振替' };
  }

  // 2. Non-calculation target is excluded
  if (!isCalculationTarget) {
    return { status: '集計除外_計算対象外' };
  }

  // 3. Check if memo starts with a user alias
  if (memo) {
    for (const alias of userAliases) {
      if (memo.startsWith(alias)) {
        return { status: `按分_${alias}`, targetUserAlias: alias };
      }
    }

    // Memo starts with '家計' -> household share
    if (memo.startsWith('家計')) {
      return { status: '按分_家計' };
    }
  }

  // 4. Check exclusion rules by category
  const matchedRule = exclusionRules.find(
    (rule) => rule.majorName === majorName && rule.minorName === minorName
  );
  if (matchedRule) {
    return { status: '集計除外_項目', appliedExclusionRuleId: matchedRule.id };
  }

  // 5. Default: household share
  return { status: '按分_家計' };
}

// ============================================================
// Share Calculation
// ============================================================

/**
 * Calculate shares for a transaction.
 *
 * Flow (from useTransactionManager.ts:188-210):
 * 1. If overrides exist -> apply overrides
 * 2. If existing shares exist -> use existing
 * 3. If '按分_家計' -> apply monthly burden ratio
 * 4. If '按分_{alias}' -> 100% to target user
 * 5. If '集計除外_*' -> no shares
 */
export function calculateShares(params: CalculateSharesParams): CalculateSharesResult {
  const {
    amount,
    processingStatus,
    transactionDate,
    users,
    userAliasMap,
    burdenRatios,
    burdenRatioDetails,
    existingShares,
    overrides,
  } = params;

  // Excluded transactions have no shares
  if (processingStatus.startsWith('集計除外')) {
    return {
      shares: [],
      appliedBurdenRatioId: null,
      hasOverrides: false,
      source: 'none',
      sharesColor: COLORS.NONE,
    };
  }

  // 1. Apply overrides if present
  if (overrides && overrides.length > 0) {
    return applyOverrides(amount, users, overrides);
  }

  // 2. Use existing shares if present
  if (existingShares && existingShares.length > 0) {
    return {
      shares: existingShares.map((s) => ({
        userId: s.userId,
        amount: s.shareAmount,
        percent: amount > 0 ? Math.round((s.shareAmount / amount) * 100) : 0,
      })),
      appliedBurdenRatioId: null,
      hasOverrides: false,
      source: 'existing',
      sharesColor: COLORS.EXISTING,
    };
  }

  // 3. Calculate default shares based on processing status
  // Extract year-month from transaction date (YYYY-MM-DD -> YYYY-MM)
  const yearMonth = transactionDate.substring(0, 7);
  const burdenRatio = burdenRatios.find((br) => br.effectiveMonth === yearMonth);

  if (processingStatus === '按分_家計') {
    return calculateHouseholdShares(amount, users, burdenRatio, burdenRatioDetails);
  }

  // 4. Individual share (按分_{alias})
  const aliasMatch = processingStatus.match(/^按分_(.+)$/);
  if (aliasMatch) {
    const targetAlias = aliasMatch[1];
    return calculateIndividualShares(amount, users, userAliasMap, targetAlias);
  }

  // Fallback: equal split
  return calculateEqualShares(amount, users);
}

/**
 * Apply override values to calculate shares.
 *
 * From useTransactionManager.ts:189-197:
 * 1. Sum all FIXED_AMOUNT overrides first
 * 2. Calculate remaining amount
 * 3. Apply PERCENT overrides to remaining amount
 */
function applyOverrides(
  amount: number,
  users: User[],
  overrides: Override[]
): CalculateSharesResult {
  // Calculate total of FIXED_AMOUNT overrides
  const fixedTotal = overrides
    .filter((o) => o.overrideType === 'FIXED_AMOUNT')
    .reduce((sum, o) => sum + o.value, 0);

  const remainingAmount = amount - fixedTotal;

  // Calculate each user's share
  const shares = users.map((u) => {
    const override = overrides.find((o) => o.userId === u.id);
    if (!override) {
      return { userId: u.id, amount: 0, percent: 0 };
    }

    const shareAmount =
      override.overrideType === 'FIXED_AMOUNT'
        ? override.value
        : Math.round(remainingAmount * (override.value / 100));

    return {
      userId: u.id,
      amount: shareAmount,
      percent: amount > 0 ? Math.round((shareAmount / amount) * 100) : 0,
    };
  });

  return {
    shares,
    appliedBurdenRatioId: null,
    hasOverrides: true,
    source: 'override',
    sharesColor: COLORS.OVERRIDE,
  };
}

/**
 * Calculate household shares based on monthly burden ratio.
 *
 * From transactionProcessor.ts:61-76:
 * - User 1 gets: Math.round(amount * (percent / 100))
 * - User 2 gets: amount - user1Share (remainder)
 */
function calculateHouseholdShares(
  amount: number,
  users: User[],
  burdenRatio: BurdenRatio | undefined,
  burdenRatioDetails: BurdenRatioDetail[]
): CalculateSharesResult {
  // Fallback to equal split if no burden ratio or not 2 users
  if (!burdenRatio || users.length !== 2) {
    return calculateEqualShares(amount, users);
  }

  const user1 = users[0];
  const user2 = users[1];

  const user1Detail = burdenRatioDetails.find(
    (d) => d.burdenRatioId === burdenRatio.id && d.userId === user1.id
  );

  const user1Percent = user1Detail?.ratioPercent ?? 50;
  const user1Amount = Math.round(amount * (user1Percent / 100));
  const user2Amount = amount - user1Amount; // Remainder to user2

  return {
    shares: [
      { userId: user1.id, amount: user1Amount, percent: user1Percent },
      { userId: user2.id, amount: user2Amount, percent: 100 - user1Percent },
    ],
    appliedBurdenRatioId: burdenRatio.id,
    hasOverrides: false,
    source: 'calculated',
    sharesColor: COLORS.DEFAULT,
  };
}

/**
 * Calculate individual shares (100% to target user).
 */
function calculateIndividualShares(
  amount: number,
  users: User[],
  userAliasMap: Map<number, string>,
  targetAlias: string
): CalculateSharesResult {
  // Find user ID by alias (reverse lookup)
  let targetUserId: number | null = null;
  for (const [userId, alias] of userAliasMap.entries()) {
    if (alias === targetAlias) {
      targetUserId = userId;
      break;
    }
  }

  return {
    shares: users.map((u) => ({
      userId: u.id,
      amount: u.id === targetUserId ? amount : 0,
      percent: u.id === targetUserId ? 100 : 0,
    })),
    appliedBurdenRatioId: null,
    hasOverrides: false,
    source: 'calculated',
    sharesColor: COLORS.DEFAULT,
  };
}

/**
 * Calculate equal shares (fallback).
 *
 * From transactionProcessor.ts:70-75:
 * - User 0 gets: amount - (shareAmount * (count - 1)) for rounding
 * - Others get: Math.round(amount / count)
 */
function calculateEqualShares(amount: number, users: User[]): CalculateSharesResult {
  if (users.length === 0) {
    return {
      shares: [],
      appliedBurdenRatioId: null,
      hasOverrides: false,
      source: 'calculated',
      sharesColor: COLORS.NONE,
    };
  }

  const shareAmount = Math.round(amount / users.length);
  const shares = users.map((u, index) => ({
    userId: u.id,
    amount: index === 0 ? amount - shareAmount * (users.length - 1) : shareAmount,
    percent: Math.round(100 / users.length),
  }));

  return {
    shares,
    appliedBurdenRatioId: null,
    hasOverrides: false,
    source: 'calculated',
    sharesColor: COLORS.DEFAULT,
  };
}

// ============================================================
// Monthly Summary Calculation
// ============================================================

/**
 * Calculate monthly summary statistics.
 *
 * Only includes transactions with processing_status === '按分_家計'
 */
export function calculateMonthlySummary(
  transactions: Array<{
    amount: number;
    processingStatus: string;
    categoryId: number | null;
    shares: ShareResult[];
  }>,
  categories: Category[],
  users: User[]
): MonthlySummary {
  // Only include household transactions
  const householdTransactions = transactions.filter(
    (tx) => tx.processingStatus === '按分_家計'
  );

  const byCategory: Record<string, number> = {};
  const byCostType: Record<string, number> = {};
  const userShares: Record<number, number> = {};

  // Initialize user shares
  users.forEach((u) => {
    userShares[u.id] = 0;
  });

  for (const tx of householdTransactions) {
    const amount = Math.abs(tx.amount);
    const category = categories.find((c) => c.id === tx.categoryId);

    // By major category
    const majorName = category?.majorName || '未分類';
    byCategory[majorName] = (byCategory[majorName] || 0) + amount;

    // By cost type
    const costType = category?.costType || '変動';
    byCostType[costType] = (byCostType[costType] || 0) + amount;

    // By user
    for (const share of tx.shares) {
      userShares[share.userId] = (userShares[share.userId] || 0) + share.amount;
    }
  }

  const totalSpending = Object.values(byCategory).reduce((a, b) => a + b, 0);

  return {
    totalSpending,
    byCategory,
    byCostType,
    userShares,
    transactionCount: householdTransactions.length,
  };
}

// ============================================================
// Default Percent Calculation
// ============================================================

/**
 * Get default percent for a transaction based on processing status.
 *
 * From useTransactionManager.ts:168-184:
 * - '按分_家計': Use month's burden ratio for user1
 * - '按分_{alias}': 100% if user is target, 0% otherwise
 * - '集計除外_*': null
 */
export function getDefaultPercent(
  processingStatus: string,
  users: User[],
  userAliasMap: Map<number, string>,
  burdenRatioDetails: BurdenRatioDetail[],
  targetBurdenRatioId: number | null
): number | null {
  // Excluded transactions have no default percent
  if (processingStatus.startsWith('集計除外')) {
    return null;
  }

  if (users.length === 0) {
    return null;
  }

  const user1Id = users[0].id;

  if (processingStatus === '按分_家計') {
    // Use month's burden ratio for user1
    if (targetBurdenRatioId !== null) {
      const detail = burdenRatioDetails.find(
        (d) => d.burdenRatioId === targetBurdenRatioId && d.userId === user1Id
      );
      return detail?.ratioPercent ?? 50;
    }
    return 50; // Default
  }

  // Individual share (按分_{alias})
  const aliasMatch = processingStatus.match(/^按分_(.+)$/);
  if (aliasMatch) {
    const targetAlias = aliasMatch[1];
    // Find user ID by alias
    for (const [userId, alias] of userAliasMap.entries()) {
      if (alias === targetAlias) {
        return userId === user1Id ? 100 : 0;
      }
    }
  }

  return null;
}
