import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Transaction,
  Category,
  User,
  Tag,
  TransactionShare,
  TransactionShareOverride,
  TransactionTag,
  BurdenRatio,
  MonthlyMemo,
  MonthlySummary,
  EnrichedTransaction,
  ChatMessage,
  AIAnalysisResponse,
} from './types';

const API_BASE = '/api';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// Master data hooks
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchApi<Category[]>('/master/categories'),
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => fetchApi<User[]>('/master/users'),
    staleTime: 1000 * 60 * 30,
  });
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => fetchApi<Tag[]>('/master/tags'),
    staleTime: 1000 * 60 * 5,
  });
}

// Transaction hooks
export function useTransactions(year: string, month: string, includeTagged = false) {
  return useQuery({
    queryKey: ['transactions', year, month, includeTagged],
    queryFn: () =>
      fetchApi<Transaction[]>(
        `/transactions?year=${year}&month=${month}&includeTagged=${includeTagged}`
      ),
  });
}

export function useTransactionShares(transactionIds: number[]) {
  return useQuery({
    queryKey: ['transaction-shares', transactionIds],
    queryFn: () =>
      transactionIds.length > 0
        ? fetchApi<TransactionShare[]>(`/transactions/shares?ids=${transactionIds.join(',')}`)
        : Promise.resolve([]),
    enabled: transactionIds.length > 0,
  });
}

export function useTransactionOverrides(transactionIds: number[]) {
  return useQuery({
    queryKey: ['transaction-overrides', transactionIds],
    queryFn: () =>
      transactionIds.length > 0
        ? fetchApi<TransactionShareOverride[]>(
            `/transactions/overrides?ids=${transactionIds.join(',')}`
          )
        : Promise.resolve([]),
    enabled: transactionIds.length > 0,
  });
}

export function useTransactionTags(transactionIds: number[]) {
  return useQuery({
    queryKey: ['transaction-tags', transactionIds],
    queryFn: () =>
      transactionIds.length > 0
        ? fetchApi<TransactionTag[]>(`/transactions/tags?ids=${transactionIds.join(',')}`)
        : Promise.resolve([]),
    enabled: transactionIds.length > 0,
  });
}

export function useBurdenRatio(year: string, month: string) {
  return useQuery({
    queryKey: ['burden-ratio', year, month],
    queryFn: () =>
      fetchApi<BurdenRatio | null>(`/transactions/burden-ratio?year=${year}&month=${month}`),
  });
}

export function useMonthlySummary(year: string, month: string, includeTagged = false) {
  return useQuery({
    queryKey: ['monthly-summary', year, month, includeTagged],
    queryFn: () =>
      fetchApi<MonthlySummary>(
        `/transactions/summary?year=${year}&month=${month}&includeTagged=${includeTagged}`
      ),
  });
}

// Enriched transactions hook
export function useEnrichedTransactions(year: string, month: string, includeTagged = false) {
  const { data: transactions = [], isLoading: txLoading } = useTransactions(
    year,
    month,
    includeTagged
  );
  const { data: categories = [] } = useCategories();
  const { data: users = [] } = useUsers();

  const transactionIds = transactions.map((tx) => tx.id);
  const { data: shares = [] } = useTransactionShares(transactionIds);
  const { data: overrides = [] } = useTransactionOverrides(transactionIds);

  const enrichedTransactions: EnrichedTransaction[] = transactions.map((tx) => {
    const category = categories.find((c) => c.id === tx.category_id);
    const txShares = shares.filter((s) => s.transaction_id === tx.id);
    const txOverrides = overrides.filter((o) => o.transaction_id === tx.id);
    const hasOverrides = txOverrides.length > 0;

    // Build user shares
    const userShares = txShares.map((share) => {
      const override = txOverrides.find((o) => o.user_id === share.user_id);
      const amount = override ? override.amount : share.amount;
      const user = users.find((u) => u.id === share.user_id);
      const totalAmount = Math.abs(tx.amount);
      const percent = totalAmount > 0 ? (amount / totalAmount) * 100 : 0;

      return {
        userId: share.user_id,
        alias: user?.aliases[0] || user?.name || `User ${share.user_id}`,
        amount,
        percent,
      };
    });

    return {
      ...tx,
      categoryMajorName: category?.major_name || '未分類',
      categoryMinorName: category?.minor_name || '',
      costType: category?.cost_type || '',
      hasOverrides,
      userShares,
    };
  });

  return {
    data: enrichedTransactions,
    isLoading: txLoading,
  };
}

// Monthly memo hooks
export function useMonthlyMemo(targetMonth: string) {
  return useQuery({
    queryKey: ['monthly-memo', targetMonth],
    queryFn: () => fetchApi<MonthlyMemo | null>(`/memos/${targetMonth}`),
  });
}

export function useSaveMonthlyMemo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ targetMonth, content }: { targetMonth: string; content: string }) =>
      fetchApi<MonthlyMemo>(`/memos/${targetMonth}`, {
        method: 'PUT',
        body: JSON.stringify({ memo_content: content }),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['monthly-memo', variables.targetMonth] });
    },
  });
}

// AI analysis hooks
export function useAIAnalysis() {
  return useMutation({
    mutationFn: ({
      summary,
      month,
      history,
      userMessage,
    }: {
      summary: { totalSpending: number; byCategory: Record<string, number>; userShares: Record<string, number> };
      month: string;
      history?: ChatMessage[];
      userMessage?: string;
    }) =>
      fetchApi<AIAnalysisResponse>('/ai/analyze', {
        method: 'POST',
        body: JSON.stringify({ summary, month, history, userMessage }),
      }),
  });
}

// Category summary calculation
export function calculateCategorySummary(
  transactions: Transaction[],
  categories: Category[]
): Record<string, { amount: number; minors: Record<string, number> }> {
  const summary: Record<string, { amount: number; minors: Record<string, number> }> = {};

  transactions
    .filter((tx) => tx.processing_status === '按分_家計')
    .forEach((tx) => {
      const category = categories.find((c) => c.id === tx.category_id);
      const majorName = category?.major_name || '未分類';
      const minorName = category?.minor_name || '未分類';
      const amount = Math.abs(tx.amount);

      if (!summary[majorName]) {
        summary[majorName] = { amount: 0, minors: {} };
      }
      summary[majorName].amount += amount;

      if (!summary[majorName].minors[minorName]) {
        summary[majorName].minors[minorName] = 0;
      }
      summary[majorName].minors[minorName] += amount;
    });

  return summary;
}

// Cost type summary calculation
export function calculateCostTypeSummary(
  transactions: Transaction[],
  categories: Category[]
): Record<string, { amount: number; majors: Record<string, { amount: number; minors: Record<string, number> }> }> {
  const summary: Record<string, { amount: number; majors: Record<string, { amount: number; minors: Record<string, number> }> }> = {};

  transactions
    .filter((tx) => tx.processing_status === '按分_家計')
    .forEach((tx) => {
      const category = categories.find((c) => c.id === tx.category_id);
      const costType = category?.cost_type || '未分類';
      const majorName = category?.major_name || '未分類';
      const minorName = category?.minor_name || '未分類';
      const amount = Math.abs(tx.amount);

      if (!summary[costType]) {
        summary[costType] = { amount: 0, majors: {} };
      }
      summary[costType].amount += amount;

      if (!summary[costType].majors[majorName]) {
        summary[costType].majors[majorName] = { amount: 0, minors: {} };
      }
      summary[costType].majors[majorName].amount += amount;

      if (!summary[costType].majors[majorName].minors[minorName]) {
        summary[costType].majors[majorName].minors[minorName] = 0;
      }
      summary[costType].majors[majorName].minors[minorName] += amount;
    });

  return summary;
}
